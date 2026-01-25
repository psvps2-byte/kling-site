declare module "heic-convert" {
  type Options = {
    buffer: Buffer;
    format: "JPEG" | "PNG";
    quality?: number;
  };

  const convert: (options: Options) => Promise<ArrayBuffer | Uint8Array | Buffer>;
  export default convert;
}
