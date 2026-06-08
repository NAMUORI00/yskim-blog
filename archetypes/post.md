---
title: "{{ replace .File.ContentBaseName "-" " " | title }}"
date: {{ .Date }}
draft: true
publish: false
slug: "{{ .File.ContentBaseName }}"
tags:
  - notes
summary: ""
canonical: ""
---

Write the post here.
