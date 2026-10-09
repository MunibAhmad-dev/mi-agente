# AEOS core image: stdlib-only kernel, no heavy dependencies (spec §8 low-resource-first).
# Multi-stage: builder installs the package, runtime copies only what is needed.
FROM python:3.12-slim AS builder

WORKDIR /build
COPY pyproject.toml README.md ./
COPY aeos ./aeos
RUN pip install --no-cache-dir --prefix=/install .

FROM python:3.12-slim AS runtime

LABEL org.opencontainers.image.title="aeos" \
      org.opencontainers.image.description="Real-World Autonomous Economic AI OS (core)" \
      org.opencontainers.image.licenses="MIT"

RUN useradd --create-home --shell /usr/sbin/nologin aeos
WORKDIR /app
COPY --from=builder /install /usr/local
COPY --chown=aeos:aeos aeos ./aeos

USER aeos
ENV AEOS_MODE=paper \
    AEOS_DATA_DIR=/app/data
VOLUME /app/data

# default: health check + status (compose overrides the command per profile)
HEALTHCHECK --interval=60s --timeout=10s --start-period=15s --retries=3 \
  CMD python -m aeos.cli doctor || exit 1

CMD ["python", "-m", "aeos.cli", "status"]
