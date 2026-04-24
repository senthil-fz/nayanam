/// <reference types="nativewind/types" />

// NativeWind pipes global.css through Metro for Tailwind. TS doesn't know
// about `.css` side-effect imports; this shim quiets the ambient import.
declare module '*.css';
