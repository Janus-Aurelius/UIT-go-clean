#!/bin/bash
# Build custom k6 binary with xk6-mqtt extension (Linux/Mac)
# Primary: Docker build (no Go installation needed)
# Fallback: Local Go build

set -e

USE_GO=false
HELP=false

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --use-go)
            USE_GO=true
            shift
            ;;
        --help)
            HELP=true
            shift
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

if [ "$HELP" = true ]; then
    cat << EOF
Build k6 with xk6-mqtt extension

Usage:
    ./build-k6-mqtt.sh              # Docker build (default, recommended)
    ./build-k6-mqtt.sh --use-go     # Local Go build (fallback)

Options:
    --use-go    Use local Go compiler instead of Docker
    --help      Show this help message

Requirements:
    Docker build: Docker installed and running
    Go build:     Go 1.20+ installed
EOF
    exit 0
fi

echo ""
echo "========================================"
echo "k6 + xk6-mqtt Extension Builder"
echo "========================================"
echo ""

# ============================================================================
# Method 1: Docker Build (Primary, Recommended)
# ============================================================================
if [ "$USE_GO" = false ]; then
    echo "[1/4] Checking Docker availability..."
    
    if ! command -v docker &> /dev/null; then
        echo "Error: Docker is not installed or not in PATH"
        echo "Tip: Install Docker or use --use-go flag for local build"
        exit 1
    fi

    if ! docker ps &> /dev/null; then
        echo "Error: Docker daemon is not running"
        echo "Tip: Start Docker or use --use-go flag for local build"
        exit 1
    fi

    echo "✓ Docker is available"
    echo ""

    echo "[2/4] Building k6 with xk6-mqtt via Docker..."
    echo "This may take 2-5 minutes (first time only)..."
    echo ""
    
    docker build -f Dockerfile.k6-mqtt -t k6-mqtt:latest . --no-cache

    echo ""
    echo "[3/4] Extracting binary from Docker image..."
    
    # Create temporary container
    CONTAINER_NAME="k6-mqtt-temp-$(date +%s)"
    docker create --name "$CONTAINER_NAME" k6-mqtt:latest > /dev/null
    
    # Extract binary
    docker cp "$CONTAINER_NAME:/usr/local/bin/k6" ./k6-mqtt
    
    # Cleanup
    docker rm "$CONTAINER_NAME" > /dev/null
    
    # Make executable
    chmod +x ./k6-mqtt

    echo "✓ Binary extracted"
    echo ""
fi

# ============================================================================
# Method 2: Local Go Build (Fallback)
# ============================================================================
if [ "$USE_GO" = true ]; then
    echo "[1/4] Checking Go installation..."
    
    if ! command -v go &> /dev/null; then
        echo "Error: Go is not installed or not in PATH"
        echo "Download from: https://go.dev/doc/install"
        exit 1
    fi

    GO_VERSION=$(go version)
    echo "✓ $GO_VERSION"
    echo ""

    echo "[2/4] Installing xk6 (if not present)..."
    
    if ! command -v xk6 &> /dev/null; then
        echo "  Installing xk6..."
        go install go.k6.io/xk6/cmd/xk6@latest
    fi
    
    echo "✓ xk6 is available"
    echo ""

    echo "[3/4] Building k6 with xk6-mqtt extension..."
    echo "This may take 2-5 minutes..."
    echo ""
    
    xk6 build --with github.com/pmalhaire/xk6-mqtt@latest --output k6-mqtt
    
    # Make executable
    chmod +x ./k6-mqtt
fi

# ============================================================================
# Verification
# ============================================================================
echo "[4/4] Verifying build..."

if [ ! -f ./k6-mqtt ]; then
    echo "Error: Binary not found at ./k6-mqtt"
    exit 1
fi

# Test the binary
echo "  Testing binary..."
VERSION=$(./k6-mqtt version)

echo ""
echo "========================================"
echo "✓ Build Complete!"
echo "========================================"
echo ""
echo "Binary location: $(pwd)/k6-mqtt"
echo "Version: $VERSION"
echo ""
echo "Usage:"
echo "  ./k6-mqtt run performance-test.js"
echo "  ./k6-mqtt run --vus 50 --duration 5m performance-test.js"
echo ""
echo "Note: This binary includes native MQTT support via xk6-mqtt extension"
echo "      Standard k6 will NOT work for MQTT-enabled tests"
echo ""
