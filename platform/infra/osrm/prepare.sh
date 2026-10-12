#!/usr/bin/env bash
# Build an OSRM car graph for Thailand (Geofabrik extract). ~10-20 min, ~4 GB RAM.
# Then: docker compose --profile osrm up -d osrm  and set ROUTING_PROVIDER=osrm OSRM_URL=http://localhost:5000
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p data
IMG=ghcr.io/project-osrm/osrm-backend:v5.27.1
[ -f data/thailand-latest.osm.pbf ] || curl -L -o data/thailand-latest.osm.pbf https://download.geofabrik.de/asia/thailand-latest.osm.pbf
docker run --rm -t -v "$PWD/data:/data" $IMG osrm-extract -p /opt/car.lua /data/thailand-latest.osm.pbf
docker run --rm -t -v "$PWD/data:/data" $IMG osrm-partition /data/thailand-latest.osrm
docker run --rm -t -v "$PWD/data:/data" $IMG osrm-customize /data/thailand-latest.osrm
echo "OSRM data ready in infra/osrm/data"
