# Gunicorn configuration for Knowledge Layer v5
# Increase worker timeout to handle long-running requests
import multiprocessing
import os

# Worker timeout in seconds (must be less than Cloud Run timeout of 90s)
# Use environment variable if set, otherwise default to 120
timeout = int(os.environ.get('GUNICORN_TIMEOUT', '120'))

# Number of worker processes (Cloud Run will limit this based on CPU)
workers = int(os.environ.get('GUNICORN_WORKERS', str(multiprocessing.cpu_count() * 2 + 1)))

# Worker class
worker_class = "sync"

# Keep alive
keepalive = 5

# Logging
accesslog = "-"
errorlog = "-"
loglevel = "info"

# Process naming
proc_name = "knowledge-layer-v5"

# Graceful timeout (time to wait for workers to finish)
graceful_timeout = 30

