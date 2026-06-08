---
title: "Install Hugo Git Publisher"
date: 2026-06-08
draft: false
publish: true
slug: "hugo-git-publisher-installer"
translationKey: "hugo-git-publisher-installer"
tags:
  - obsidian
  - hugo
  - github
summary: "Windows installer page for publishing Obsidian notes from a Hugo repository through GitHub."
---

This page provides the Windows installer for **Hugo Git Publisher**, an Obsidian plugin that exports publish-ready notes to a Hugo repository and publishes them through GitHub.

## Install

1. Download the installer below.
2. Run `install.cmd`.
3. Confirm the Obsidian vault path and local Hugo public repo path.
4. Complete the browser-based GitHub login if prompted.
5. Restart Obsidian.

[Download Windows installer](/downloads/hugo-git-publisher/install.cmd)

## What It Installs

- Git
- GitHub CLI
- Node.js LTS / npm
- Obsidian plugin `Hugo Git Publisher`

The plugin does not store GitHub tokens. GitHub authentication uses GitHub CLI through `gh auth login --web`.

## Manual Downloads

- [PowerShell installer](/downloads/hugo-git-publisher/install.ps1)
- [Plugin manifest](/downloads/hugo-git-publisher/manifest.json)
- [Plugin main.js](/downloads/hugo-git-publisher/main.js)
- [Example settings](/downloads/hugo-git-publisher/data.example.json)
