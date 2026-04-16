#!/bin/sh
# Instala os git hooks deste projeto. Execute uma vez após clonar.
HOOK=".git/hooks/pre-commit"
cp scripts/pre-commit "$HOOK"
chmod +x "$HOOK"
echo "[hooks] Hook pre-commit instalado em $HOOK"
