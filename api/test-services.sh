#!/bin/bash

# ===========================================
# Test Script for Enterprise Services
# ===========================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
API_DIR="./api/server"
COVERAGE_DIR="./coverage"

echo "=========================================="
echo "  Mi LibreChat - Test Suite"
echo "=========================================="
echo ""

# Function to print status
print_status() {
  echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
  echo -e "${GREEN}[✓]${NC} $1"
}

print_warning() {
  echo -e "${YELLOW}[⚠]${NC} $1"
}

print_error() {
  echo -e "${RED}[✗]${NC} $1"
}

# Check Node.js version
check_node() {
  print_status "Checking Node.js version..."
  
  if ! command -v node &> /dev/null; then
    print_error "Node.js is not installed"
    exit 1
  fi
  
  NODE_VERSION=$(node -v)
  print_success "Node.js version: $NODE_VERSION"
}

# Install dependencies
install_deps() {
  print_status "Installing dependencies..."
  
  if [ -f "$API_DIR/package.json" ]; then
    cd "$API_DIR"
    npm ci --silent
    print_success "API dependencies installed"
    cd - > /dev/null
  fi
  
}

# Run unit tests
run_unit_tests() {
  print_status "Running unit tests..."
  
  cd "$API_DIR"
  
  if npm test -- --testPathPattern="__tests__" 2>&1; then
    print_success "Unit tests passed"
    cd - > /dev/null
    return 0
  else
    print_error "Unit tests failed"
    cd - > /dev/null
    return 1
  fi
}

# Run service tests
run_service_tests() {
  print_status "Running service tests..."
  
  cd "$API_DIR"
  
  if npm test -- --testPathPattern="services/__tests__" 2>&1; then
    print_success "Service tests passed"
    cd - > /dev/null
    return 0
  else
    print_error "Service tests failed"
    cd - > /dev/null
    return 1
  fi
}

# Run all tests with coverage
run_all_tests() {
  print_status "Running all tests with coverage..."
  
  cd "$API_DIR"
  
  if npm test -- --coverage 2>&1; then
    print_success "All tests passed with coverage"
    cd - > /dev/null
    return 0
  else
    print_error "Some tests failed"
    cd - > /dev/null
    return 1
  fi
}

# Run linting
run_lint() {
  print_status "Running linter..."
  
  cd "$API_DIR"
  
  if npm run lint 2>&1; then
    print_success "Linting passed"
    cd - > /dev/null
    return 0
  else
    print_warning "Linting found issues"
    cd - > /dev/null
    return 1
  fi
}

# Check code formatting
check_format() {
  print_status "Checking code format..."
  
  cd "$API_DIR"
  
  if npm run format:check 2>&1; then
    print_success "Code format is correct"
    cd - > /dev/null
    return 0
  else
    print_warning "Code format needs adjustment"
    cd - > /dev/null
    return 1
  fi
}

# Generate test report
generate_report() {
  print_status "Generating test report..."
  
  if [ -d "$COVERAGE_DIR" ]; then
    print_success "Coverage report available at: $COVERAGE_DIR/index.html"
    echo ""
    echo "=========================================="
    echo "  Coverage Summary"
    echo "=========================================="
    
    if command -v npx &> /dev/null; then
      npx coverage-summary-cli "$COVERAGE_DIR" 2>/dev/null || true
    fi
  else
    print_warning "No coverage report found"
  fi
}

# Show usage
show_usage() {
  echo "Usage: $0 [command]"
  echo ""
  echo "Commands:"
  echo "  all           Run all tests and checks (default)"
  echo "  unit          Run unit tests only"
  echo "  services      Run service tests only"
  echo "  coverage      Run all tests with coverage"
  echo "  lint          Run linter"
  echo "  format        Check code format"
  echo "  install       Install dependencies"
  echo "  report        Generate coverage report"
  echo "  help          Show this help message"
}

# Main
COMMAND=${1:-all}

case $COMMAND in
  all)
    check_node
    install_deps
    run_lint || true
    run_all_tests
    generate_report
    ;;
  unit)
    run_unit_tests
    ;;
  services)
    run_service_tests
    ;;
  coverage)
    run_all_tests
    generate_report
    ;;
  lint)
    run_lint
    ;;
  format)
    check_format
    ;;
  install)
    install_deps
    ;;
  report)
    generate_report
    ;;
  help|--help|-h)
    show_usage
    ;;
  *)
    print_error "Unknown command: $COMMAND"
    show_usage
    exit 1
    ;;
esac

echo ""
print_success "Test suite completed!"
