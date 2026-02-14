.PHONY: start backend frontend reset-db install

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

# Install all dependencies (Python + Node)
install:
	@echo "Setting up Python virtual environment..."
	python3 -m venv .venv
	. .venv/bin/activate && pip install -r backend/requirements.txt
	@echo ""
	@echo "Installing frontend dependencies..."
	cd frontend && npm install
	@echo ""
	@echo "✅ All dependencies installed."
