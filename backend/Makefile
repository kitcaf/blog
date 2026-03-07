.PHONY: run build test clean

run:
	go run main.go

build:
	go build -o bin/blog-backend main.go

test:
	go test -v ./...

clean:
	rm -rf bin/

install:
	go mod download

dev:
	air

docker-build:
	docker build -t blog-backend .

docker-run:
	docker run -p 8080:8080 --env-file .env blog-backend
