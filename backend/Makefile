.PHONY: run build test test-coverage setup-test-db clean install dev docker-build docker-run

run:
	go run main.go

build:
	go build -o bin/blog-backend main.go

test:
	go test -v ./test/...

test-coverage:
	go test -coverprofile=coverage.out ./test/...
	go tool cover -html=coverage.out -o coverage.html
	@echo "Coverage report: coverage.html"

setup-test-db:
	@echo "Creating test database..."
	psql -h $(shell grep DB_HOST .env | cut -d '=' -f2 | tr -d ' ') \
	     -U $(shell grep DB_USER .env | cut -d '=' -f2) \
	     -c "DROP DATABASE IF EXISTS $(shell grep TEST_DB_NAME .env | cut -d '=' -f2 | tr -d ' ');" || true
	psql -h $(shell grep DB_HOST .env | cut -d '=' -f2 | tr -d ' ') \
	     -U $(shell grep DB_USER .env | cut -d '=' -f2) \
	     -c "CREATE DATABASE $(shell grep TEST_DB_NAME .env | cut -d '=' -f2 | tr -d ' ');"
	@echo "Test database created!"

clean:
	rm -rf bin/
	rm -f coverage.out coverage.html

install:
	go mod download

dev:
	air

docker-build:
	docker build -t blog-backend .

docker-run:
	docker run -p 8080:8080 --env-file .env blog-backend
