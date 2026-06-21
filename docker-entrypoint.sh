#!/bin/sh
set -e

# Garante que /app/data existe e e writable. No Railway o volume eh
# montado em cima do diretorio criado no build, e como root nos podemos
# ajustar permissoes.
mkdir -p /app/data
chmod 0777 /app/data

# Pequeno self-test pra detectar problemas cedo (sem mascarar o erro).
if ! touch /app/data/.write-test 2>/dev/null; then
  echo "[entrypoint] AVISO: /app/data nao eh writable mesmo apos chmod"
  ls -la /app/data || true
else
  rm -f /app/data/.write-test
  echo "[entrypoint] /app/data ok"
fi

exec "$@"
