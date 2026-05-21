#!/bin/bash
# LocalTunnel wrapper for PM2
# Keeps connection alive with auto-restart
cd ~/deus
exec lt --port 4200 --subdomain deus-control
