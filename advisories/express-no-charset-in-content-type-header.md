---
title: express No Charset in Content-Type Header
author: Paweł Hałdrzyński
module_name: express
publish_date: Fri Sep 12 2014 07:46:45 GMT-0700 (PDT)
cves: "[]"
vulnerable_versions: "< 3.8.0, < 4.3.0"
patched_versions: ">= 3.8.0, >= 4.3.0"
---

## Overview
Vulnerable versions of express do not specify a charset field in the content-type heade while displaying 400 level response messages. The lack of enforcing user's browser to set correct charset, could be leveraged by an attacker to perform a cross-site scripting attack, using non-standard encodings, like UTF-7.

## Recommendation
Update express to a patched version.