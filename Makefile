.PHONY: start backend frontend reset-db install test-e2e test-e2e-headed

# Start both backend and frontend
start:
	./scripts/start-all.sh

# Start only the backend
backend:
	./scripts/start-backend.sh

# Start only the frontend
frontend:
	./scripts/start-frontend.sh

# Reset the database and all data
reset-db:
	./scripts/reset-db.sh

# Run Playwright end-to-end tests (auto-starts isolated test server)
test-e2e:
	cd e2e && npx playwright test --config playwright.config.ts

# Run Playwright tests with a visible browser window
test-e2e-headed:
	cd e2e && npx playwright test --config playwright.config.ts --headed

# Install all dependencies (Python + Node + E2E)
install:
	@echo "Checking for FFmpeg..."
	@if ! command -v ffmpeg > /dev/null 2>&1; then \
		echo "⚠️  FFmpeg not found. Please install it:"; \
		if [ "$$(uname)" = "Darwin" ]; then \
			echo "   macOS: brew install ffmpeg"; \
		else \
			echo "   Linux: sudo apt-get install ffmpeg (or your distribution's package manager)"; \
		fi; \
		echo ""; \
	fi
	@echo "Setting up Python virtual environment..."
	python3 -m venv .venv
	. .venv/bin/activate && pip install -r backend/requirements.txt
	@echo ""
	@echo "Installing frontend dependencies..."
	cd frontend && npm install
	@echo ""
	@echo "Installing E2E test dependencies..."
	cd e2e && npm install && npx playwright install chromium
	@echo ""
	@echo "✅ All dependencies installed."
