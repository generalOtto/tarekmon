# TarekMon

A belated-birthday gimmick for Tarek: a small, complete, very funny Pokémon-style web game where the "dumpling face" stickers of Otto, Tarek and Suhaib are the wild monsters. One town, one gym, one Champion. Plain JavaScript + Canvas, no framework, no backend; hosted as a static site.

Design doc: [claude-brain] designs/tarekmon-design.md

## Run locally

```bash
npx serve .        # or any static server; open http://localhost:3000
node --test        # unit tests for the pure game logic
```

## Deploy

Static site served via nginx in a container.

```bash
docker build -t tarekmon .
docker run --rm -d -p 8080:80 --name tarekmon tarekmon
# open http://localhost:8080
docker rm -f tarekmon
```

### Coolify

- Build pack: **Dockerfile**
- Port: **80**
- Domain: `tarekmon.othman.ca`
