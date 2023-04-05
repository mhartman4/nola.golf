# 🏌 Golf League Svelte App 🏌

## Deploy Status
![example workflow](https://github.com/mhartman4/nola.golf/actions/workflows/deploy.yml/badge.svg)

## Developing

Install the dependencies...

```bash
cd nola.golf
npm install
```

...then start [Rollup](https://rollupjs.org):

```bash
npm run dev
```

Go to [localhost:5000](http://localhost:8080). You should see the app running.

## Deploying

The deployment model uses Github actions and is defined in /.github/actions/deploy.yml

Note: In production, the site is served out of the `/public` directory, but in development it's at the root. So the only difference between `dev` and `prod` is which HTML file is served. In development, we use `public/index.html` but in prod we use `index.html`. This is dumb and only because of the way S3 static sites work. These two files should be identical other than adding "public/" to the prod paths. They should rarely need to be changed anyways.
