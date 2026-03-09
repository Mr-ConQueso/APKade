FROM golang:1.22-bookworm AS build
WORKDIR /app

COPY . .
RUN go mod tidy
RUN go build -o pion-streamer .

FROM debian:bookworm-slim
WORKDIR /app

RUN apt-get update && apt-get install -y \
    adb \
    scrcpy \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/pion-streamer /app/pion-streamer

EXPOSE 8080

CMD ["/app/pion-streamer"]