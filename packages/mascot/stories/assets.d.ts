// Vite serves imported images as URLs in Storybook; mirror that for tsc.
declare module '*.png' {
  const url: string
  export default url
}
