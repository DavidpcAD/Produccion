// CSS side-effect imports (e.g. import './Foo.css') are handled by Next.js at
// bundle time. This declaration silences the ts(2307) error for every
// component that does `import './Component.css'`.
declare module '*.css' {}
