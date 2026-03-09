import net from "net"

const socket = net.connect(27183, "127.0.0.1")

function sendTap(x: number, y: number) {
    const buf = Buffer.alloc(28)

    buf.writeUInt8(2, 0)   // type: touch
    buf.writeUInt8(0, 1)   // action: DOWN

    buf.writeBigUInt64BE(BigInt(1), 2)
    buf.writeUInt32BE(x, 10)
    buf.writeUInt32BE(y, 14)

    buf.writeUInt16BE(1080, 18)
    buf.writeUInt16BE(2400, 20)

    buf.writeUInt16BE(65535, 22)
    buf.writeUInt32BE(1, 24)

    socket.write(buf)
}