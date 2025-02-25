# Arcanum Cube Demo Page

A demo application of Arcanum Cube that allows you to solve puzzles and play.

[Demo Page](https://mawxiwtz.github.io/arcanumcube-demo/)

## Usage

### 1. Build

```
npm install
npm run build
```

### 2. Run

```
npm start
```

### 3. Play

Access http://localhost:3000 in your browser.

If you want to access from a location other than localhost, please change the host value in esbuild.js to 0.0.0.0 as below.

```
await ctx.serve({
    host: '0.0.0.0',
    port: 3000,
    servedir: `${destdir}/`,
});
```

## License

Released under the MIT license

Copyright (c) 2024 mawxiwtz
