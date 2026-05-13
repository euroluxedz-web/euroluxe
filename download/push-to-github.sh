#!/bin/bash
# Script to push EUROLUXE code to GitHub
# You need a GitHub Personal Access Token (PAT)
#
# How to create a PAT:
# 1. Go to https://github.com/settings/tokens
# 2. Click "Generate new token" > "Generate new token (classic)"
# 3. Give it a name like "euroluxe-deploy"
# 4. Select scopes: repo (full control)
# 5. Click "Generate token"
# 6. Copy the token

PROJECT_DIR="/home/z/euroluxe-github"

if [ -z "$1" ]; then
    echo "Usage: ./push-to-github.sh YOUR_GITHUB_PAT"
    echo ""
    echo "Get your PAT from: https://github.com/settings/tokens"
    exit 1
fi

PAT="$1"

cd "$PROJECT_DIR" || exit 1

# Set the remote URL with the PAT
git remote set-url origin "https://euroluxedz-web:${PAT}@github.com/euroluxedz-web/euroluxe.git"

# Push to GitHub
echo "Pushing to GitHub..."
git push origin main

if [ $? -eq 0 ]; then
    echo "✅ Successfully pushed to GitHub!"
    # Remove the PAT from the remote URL for security
    git remote set-url origin "https://github.com/euroluxedz-web/euroluxe.git"
else
    echo "❌ Push failed. Check your PAT."
    # Clean up
    git remote set-url origin "https://github.com/euroluxedz-web/euroluxe.git"
fi
