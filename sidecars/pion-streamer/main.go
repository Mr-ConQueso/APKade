package main

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"sync"
	"time"

	"github.com/pion/webrtc/v4"
	"github.com/pion/webrtc/v4/pkg/media"
)

var annexBStartCode = []byte{0x00, 0x00, 0x00, 0x01}

type StreamRequest struct {
	SessionID string                    `json:"sessionId"`
	AdbPort   int                       `json:"adbPort"`
	Offer     webrtc.SessionDescription `json:"offer"`
}

type StreamResponse struct {
	OK     bool                       `json:"ok"`
	Answer *webrtc.SessionDescription `json:"answer,omitempty"`
	Error  string                     `json:"error,omitempty"`
}

type h264SampleWriter struct {
	track *webrtc.TrackLocalStaticSample

	buffer []byte

	currentAccessUnit bytes.Buffer
	frameCount         int

	sps []byte
	pps []byte

	currentHasVCL bool
	readCount     int
}

func isVCLNALUType(nalType uint8) bool {
	return nalType == 1 || nalType == 5
}

func isAccessUnitDelimiterType(nalType uint8) bool {
	return nalType == 6 || nalType == 7 || nalType == 8 || nalType == 9
}

func (w *h264SampleWriter) Push(chunk []byte) error {
	if len(chunk) == 0 {
		return nil
	}

	w.readCount += 1
	if w.readCount <= 10 {
		log.Printf("h264 chunk #%d bytes=%d", w.readCount, len(chunk))
	}

	w.buffer = append(w.buffer, chunk...)

	nalus, remaining := extractCompleteNALUs(w.buffer)
	w.buffer = remaining

	for _, nalu := range nalus {
		if err := w.handleNALU(nalu); err != nil {
			return err
		}
	}

	return nil
}

func (w *h264SampleWriter) Flush() error {
	if len(w.buffer) > 0 {
		nalus, _ := extractAllNALUs(w.buffer)
		w.buffer = nil

		for _, nalu := range nalus {
			if err := w.handleNALU(nalu); err != nil {
				return err
			}
		}
	}

	return w.flushAccessUnit("final flush")
}

func (w *h264SampleWriter) handleNALU(nalu []byte) error {
	if len(nalu) == 0 {
		return nil
	}

	nalType := nalu[0] & 0x1F

	switch nalType {
	case 7:
		w.sps = append([]byte(nil), nalu...)
	case 8:
		w.pps = append([]byte(nil), nalu...)
	}

	if isVCLNALUType(nalType) && w.currentHasVCL {
		if err := w.flushAccessUnit("new vcl boundary"); err != nil {
			return err
		}
	}

	if isAccessUnitDelimiterType(nalType) && w.currentHasVCL {
		if err := w.flushAccessUnit(fmt.Sprintf("non-vcl boundary type=%d", nalType)); err != nil {
			return err
		}
	}

	w.currentAccessUnit.Write(annexBStartCode)
	w.currentAccessUnit.Write(nalu)

	if isVCLNALUType(nalType) {
		w.currentHasVCL = true
	}

	return nil
}

func (w *h264SampleWriter) flushAccessUnit(reason string) error {
	payload := bytes.TrimSpace(w.currentAccessUnit.Bytes())
	if len(payload) == 0 {
		w.currentAccessUnit.Reset()
		w.currentHasVCL = false
		return nil
	}

	nalus, _ := extractAllNALUs(payload)
	if len(nalus) == 0 {
		w.currentAccessUnit.Reset()
		w.currentHasVCL = false
		return nil
	}

	hasIDR := false
	hasVCL := false
	nalTypes := make([]uint8, 0, len(nalus))

	for _, nalu := range nalus {
		if len(nalu) == 0 {
			continue
		}
		nalType := nalu[0] & 0x1F
		nalTypes = append(nalTypes, nalType)

		if isVCLNALUType(nalType) {
			hasVCL = true
		}
		if nalType == 5 {
			hasIDR = true
		}
	}

	if !hasVCL {
		w.currentAccessUnit.Reset()
		w.currentHasVCL = false
		return nil
	}

	finalPayload := payload
	if hasIDR && len(w.sps) > 0 && len(w.pps) > 0 {
		var prefixed bytes.Buffer
		prefixed.Write(annexBStartCode)
		prefixed.Write(w.sps)
		prefixed.Write(annexBStartCode)
		prefixed.Write(w.pps)
		prefixed.Write(payload)
		finalPayload = prefixed.Bytes()
	}

	w.frameCount += 1

	if w.frameCount <= 10 || hasIDR {
		log.Printf(
			"h264 sample #%d reason=%s bytes=%d nal_types=%v cached_sps=%t cached_pps=%t",
			w.frameCount,
			reason,
			len(finalPayload),
			nalTypes,
			len(w.sps) > 0,
			len(w.pps) > 0,
		)
	}

	if err := w.track.WriteSample(media.Sample{
		Data:     finalPayload,
		Duration: time.Second / 30,
	}); err != nil {
		return fmt.Errorf("write h264 sample #%d: %w", w.frameCount, err)
	}

	w.currentAccessUnit.Reset()
	w.currentHasVCL = false
	return nil
}

func extractCompleteNALUs(data []byte) ([][]byte, []byte) {
	indices := findAllStartCodes(data)
	if len(indices) < 2 {
		return nil, data
	}

	var nalus [][]byte

	for i := 0; i < len(indices)-1; i++ {
		start := indices[i].start + indices[i].length
		end := indices[i+1].start
		if end > start {
			nalu := bytes.Trim(data[start:end], "\x00")
			if len(nalu) > 0 {
				nalus = append(nalus, append([]byte(nil), nalu...))
			}
		}
	}

	remaining := append([]byte(nil), data[indices[len(indices)-1].start:]...)
	return nalus, remaining
}

func extractAllNALUs(data []byte) ([][]byte, []byte) {
	indices := findAllStartCodes(data)
	if len(indices) == 0 {
		return nil, nil
	}

	var nalus [][]byte

	for i := 0; i < len(indices); i++ {
		start := indices[i].start + indices[i].length
		end := len(data)
		if i+1 < len(indices) {
			end = indices[i+1].start
		}

		if end > start {
			nalu := bytes.Trim(data[start:end], "\x00")
			if len(nalu) > 0 {
				nalus = append(nalus, append([]byte(nil), nalu...))
			}
		}
	}

	return nalus, nil
}

type startCodeIndex struct {
	start  int
	length int
}

func findAllStartCodes(data []byte) []startCodeIndex {
	var out []startCodeIndex

	for i := 0; i <= len(data)-3; i++ {
		if i <= len(data)-4 &&
			data[i] == 0x00 &&
			data[i+1] == 0x00 &&
			data[i+2] == 0x00 &&
			data[i+3] == 0x01 {
			out = append(out, startCodeIndex{start: i, length: 4})
			i += 3
			continue
		}

		if data[i] == 0x00 &&
			data[i+1] == 0x00 &&
			data[i+2] == 0x01 {
			out = append(out, startCodeIndex{start: i, length: 3})
			i += 2
		}
	}

	return out
}

func handleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("content-type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"ok": true,
	})
}

func createMKVTempFile(sessionID string) (string, error) {
	name := sessionID
	if name == "" {
		name = strconv.FormatInt(time.Now().UnixNano(), 10)
	}

	filePath := filepath.Join(os.TempDir(), fmt.Sprintf("apkade-%s.mkv", name))
	if err := os.Remove(filePath); err != nil && !os.IsNotExist(err) {
		return "", err
	}

	return filePath, nil
}

func waitForFileToGrow(filePath string, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)

	for time.Now().Before(deadline) {
		info, err := os.Stat(filePath)
		if err == nil && info.Size() > 0 {
			return nil
		}

		if err != nil && !os.IsNotExist(err) {
			return fmt.Errorf("stat mkv file: %w", err)
		}

		time.Sleep(100 * time.Millisecond)
	}

	return fmt.Errorf("timed out waiting for MKV file to grow: %s", filePath)
}

func streamGrowingFile(filePath string, pipeWriter *io.PipeWriter, cmd *exec.Cmd) {
	defer func() {
		_ = pipeWriter.Close()
	}()

	file, err := os.Open(filePath)
	if err != nil {
		_ = pipeWriter.CloseWithError(fmt.Errorf("open mkv file: %w", err))
		return
	}
	defer func() {
		_ = file.Close()
	}()

	buffer := make([]byte, 64*1024)
	var offset int64

	for {
		n, readErr := file.ReadAt(buffer, offset)
		if n > 0 {
			if _, writeErr := pipeWriter.Write(buffer[:n]); writeErr != nil {
				_ = pipeWriter.CloseWithError(fmt.Errorf("pipe write failed: %w", writeErr))
				return
			}
			offset += int64(n)
			continue
		}

		if readErr == nil {
			continue
		}

		if readErr != io.EOF {
			_ = pipeWriter.CloseWithError(fmt.Errorf("read growing mkv failed: %w", readErr))
			return
		}

		if cmd.ProcessState != nil && cmd.ProcessState.Exited() {
			return
		}

		time.Sleep(50 * time.Millisecond)
	}
}

func startScrcpyRecording(adbPort int, sessionID string) (string, *exec.Cmd, func(), error) {
	serial := "localhost:" + strconv.Itoa(adbPort)

	filePath, err := createMKVTempFile(sessionID)
	if err != nil {
		return "", nil, nil, err
	}

	cleanupFile := func() {
		if err := os.Remove(filePath); err != nil && !os.IsNotExist(err) {
			log.Println("mkv file remove error:", err)
		}
	}

	cmd := exec.Command(
		"scrcpy",
		"--serial", serial,
		"--no-audio",
		"--no-control",
		"--no-playback",
		"--no-window",
		"--video-codec=h264",
		"--max-fps=30",
		"--record="+filePath,
		"--record-format=mkv",
	)

	stderr, err := cmd.StderrPipe()
	if err != nil {
		cleanupFile()
		return "", nil, nil, err
	}

	go func() {
		scanner := bufio.NewScanner(stderr)
		for scanner.Scan() {
			log.Println("scrcpy:", scanner.Text())
		}
	}()

	if err := cmd.Start(); err != nil {
		cleanupFile()
		return "", nil, nil, err
	}

	go func() {
		err := cmd.Wait()
		if err != nil {
			log.Println("scrcpy exited with error:", err)
			return
		}
		log.Println("scrcpy exited cleanly")
	}()

	log.Println("started scrcpy for", serial, "file", filePath)

	if err := waitForFileToGrow(filePath, 10*time.Second); err != nil {
		if cmd.Process != nil {
			_ = cmd.Process.Kill()
		}
		cleanupFile()
		return "", nil, nil, err
	}

	return filePath, cmd, cleanupFile, nil
}

func startFFmpegH264Pipe(filePath string, scrcpyCmd *exec.Cmd) (io.ReadCloser, *exec.Cmd, func(), error) {
	mkvReader, mkvWriter := io.Pipe()

	go streamGrowingFile(filePath, mkvWriter, scrcpyCmd)

	ffmpeg := exec.Command(
		"ffmpeg",
		"-loglevel", "warning",
		"-fflags", "nobuffer",
		"-analyzeduration", "0",
		"-probesize", "32768",
		"-f", "matroska",
		"-i", "pipe:0",
		"-an",
		"-c:v", "copy",
		"-bsf:v", "h264_mp4toannexb,h264_metadata=aud=insert",
		"-f", "h264",
		"-flush_packets", "1",
		"pipe:1",
	)

	ffmpeg.Stdin = mkvReader

	stdout, err := ffmpeg.StdoutPipe()
	if err != nil {
		_ = mkvReader.Close()
		return nil, nil, nil, err
	}

	stderr, err := ffmpeg.StderrPipe()
	if err != nil {
		_ = mkvReader.Close()
		return nil, nil, nil, err
	}

	go func() {
		scanner := bufio.NewScanner(stderr)
		for scanner.Scan() {
			log.Println("ffmpeg:", scanner.Text())
		}
	}()

	if err := ffmpeg.Start(); err != nil {
		_ = mkvReader.Close()
		return nil, nil, nil, err
	}

	go func() {
		err := ffmpeg.Wait()
		if err != nil {
			log.Println("ffmpeg exited with error:", err)
			return
		}
		log.Println("ffmpeg exited cleanly")
	}()

	log.Println("started ffmpeg for", filePath)

	cleanup := func() {
		_ = mkvReader.Close()
		if ffmpeg.Process != nil {
			_ = ffmpeg.Process.Kill()
		}
	}

	return stdout, ffmpeg, cleanup, nil
}

func pumpH264Samples(r io.Reader, track *webrtc.TrackLocalStaticSample) error {
	writer := &h264SampleWriter{
		track: track,
	}

	buffer := make([]byte, 64*1024)

	for {
		n, err := r.Read(buffer)
		if n > 0 {
			if pumpErr := writer.Push(buffer[:n]); pumpErr != nil {
				return pumpErr
			}
		}

		if err != nil {
			if err == io.EOF {
				return writer.Flush()
			}
			return err
		}
	}
}

func handleStream(w http.ResponseWriter, r *http.Request) {
	var req StreamRequest

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(StreamResponse{
			OK:    false,
			Error: "Invalid request body",
		})
		return
	}

	log.Printf("incoming stream request: session=%s adbPort=%d offerType=%s", req.SessionID, req.AdbPort, req.Offer.Type)

	peerConnection, err := webrtc.NewPeerConnection(webrtc.Configuration{})
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		_ = json.NewEncoder(w).Encode(StreamResponse{
			OK:    false,
			Error: err.Error(),
		})
		return
	}

	track, err := webrtc.NewTrackLocalStaticSample(
		webrtc.RTPCodecCapability{
			MimeType:  webrtc.MimeTypeH264,
			ClockRate: 90000,
		},
		"video",
		"apkade",
	)
	if err != nil {
		_ = peerConnection.Close()
		w.WriteHeader(http.StatusInternalServerError)
		_ = json.NewEncoder(w).Encode(StreamResponse{
			OK:    false,
			Error: err.Error(),
		})
		return
	}

	sender, err := peerConnection.AddTrack(track)
	if err != nil {
		_ = peerConnection.Close()
		w.WriteHeader(http.StatusInternalServerError)
		_ = json.NewEncoder(w).Encode(StreamResponse{
			OK:    false,
			Error: err.Error(),
		})
		return
	}

	go func() {
		rtcpBuf := make([]byte, 1500)
		for {
			if _, _, err := sender.Read(rtcpBuf); err != nil {
				log.Println("rtcp read ended:", err)
				return
			}
		}
	}()

	var (
		cleanupOnce sync.Once
		scrcpyCmd   *exec.Cmd
		ffmpegCmd   *exec.Cmd
		source      io.Closer
		cleanupFile func()
		cleanupFF   func()
	)

	cleanup := func(reason string) {
		cleanupOnce.Do(func() {
			log.Println("cleanup:", reason)

			if source != nil {
				if err := source.Close(); err != nil {
					log.Println("source close error:", err)
				}
			}

			if cleanupFF != nil {
				cleanupFF()
			}

			if ffmpegCmd != nil && ffmpegCmd.Process != nil {
				if err := ffmpegCmd.Process.Kill(); err != nil {
					log.Println("ffmpeg kill error:", err)
				}
			}

			if scrcpyCmd != nil && scrcpyCmd.Process != nil {
				if err := scrcpyCmd.Process.Kill(); err != nil {
					log.Println("scrcpy kill error:", err)
				}
			}

			if cleanupFile != nil {
				cleanupFile()
			}

			if err := peerConnection.Close(); err != nil {
				log.Println("peer close error:", err)
			}
		})
	}

	peerConnection.OnConnectionStateChange(func(state webrtc.PeerConnectionState) {
		log.Println("peer state:", state.String())

		switch state {
		case webrtc.PeerConnectionStateFailed:
			cleanup("peer failed")
		case webrtc.PeerConnectionStateClosed:
			cleanup("peer closed")
		case webrtc.PeerConnectionStateDisconnected:
			log.Println("peer disconnected; waiting to see if it recovers")
		}
	})

	if err := peerConnection.SetRemoteDescription(req.Offer); err != nil {
		cleanup("set remote description failed")
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(StreamResponse{
			OK:    false,
			Error: err.Error(),
		})
		return
	}

	answer, err := peerConnection.CreateAnswer(nil)
	if err != nil {
		cleanup("create answer failed")
		w.WriteHeader(http.StatusInternalServerError)
		_ = json.NewEncoder(w).Encode(StreamResponse{
			OK:    false,
			Error: err.Error(),
		})
		return
	}

	gatherComplete := webrtc.GatheringCompletePromise(peerConnection)

	if err := peerConnection.SetLocalDescription(answer); err != nil {
		cleanup("set local description failed")
		w.WriteHeader(http.StatusInternalServerError)
		_ = json.NewEncoder(w).Encode(StreamResponse{
			OK:    false,
			Error: err.Error(),
		})
		return
	}

	<-gatherComplete
	log.Println("local SDP gathering completed")

	filePath, startedScrcpyCmd, startedCleanupFile, err := startScrcpyRecording(req.AdbPort, req.SessionID)
	if err != nil {
		cleanup("start scrcpy failed")
		w.WriteHeader(http.StatusInternalServerError)
		_ = json.NewEncoder(w).Encode(StreamResponse{
			OK:    false,
			Error: err.Error(),
		})
		return
	}
	scrcpyCmd = startedScrcpyCmd
	cleanupFile = startedCleanupFile

	h264Stream, startedFFmpegCmd, startedCleanupFF, err := startFFmpegH264Pipe(filePath, scrcpyCmd)
	if err != nil {
		cleanup("start ffmpeg failed")
		w.WriteHeader(http.StatusInternalServerError)
		_ = json.NewEncoder(w).Encode(StreamResponse{
			OK:    false,
			Error: err.Error(),
		})
		return
	}
	source = h264Stream
	ffmpegCmd = startedFFmpegCmd
	cleanupFF = startedCleanupFF

	go func() {
		defer func() {
			log.Println("h264 pump goroutine ending")
			cleanup("h264 pump ended")
		}()

		log.Println("starting h264 pump")

		if err := pumpH264Samples(h264Stream, track); err != nil {
			log.Println("h264 pump error:", err)
			return
		}

		log.Println("h264 pump finished without error")
	}()

	w.Header().Set("content-type", "application/json")
	_ = json.NewEncoder(w).Encode(StreamResponse{
		OK:     true,
		Answer: peerConnection.LocalDescription(),
	})
}

func main() {
	http.HandleFunc("/health", handleHealth)
	http.HandleFunc("/stream", handleStream)

	log.Println("pion-streamer listening on :8080")
	log.Fatal(http.ListenAndServe(":8080", nil))
}