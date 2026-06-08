---
title: "{{ replace .File.ContentBaseName "-" " " | title }}"
date: {{ .Date }}
draft: true
slug: "{{ .File.ContentBaseName }}"
categories:
  - notes
tags:
  - notes
summary: ""
canonical: ""
translationKey: "{{ .File.ContentBaseName }}"
comments: true
---

Write the post here.
