/// <reference types="vite/client" />

// CSS side-effect imports (e.g. import './Foo.css') are handled by Vite at
// bundle time. This declaration silences the ts(2882) error for every
// component that does `import './Component.css'`.
declare module '*.css' {}
