/// <reference types="astro/client" />
declare module "@device-client" {
  export class LightVMClient {
    constructor(transport: any, options?: any);
    describe(): Promise<any>;
    json(op: string, fields?: any): Promise<any>;
    setDeviceNickname(name: string | null, expected: any): Promise<any>;
    close(): Promise<void>;
    transport: any;
    closed: boolean;
  }
}
declare module "@device-transports" {
  export class SerialTransport {
    open(): Promise<any>;
    close(): Promise<void>;
    port: any;
    label: string;
  }
  export class HttpTransport {
    constructor(url: string);
    open(): Promise<any>;
    close(): Promise<void>;
    identity: any;
    label: string;
  }
}
declare module "@firmware-contract" {
  export function assessCandidate(
    device: any,
    artifact: any,
    features: string[],
    method: string,
    tools?: string[],
  ): { state: string; reasons: string[] };
  export function decodeUf2(
    bytes: Uint8Array,
    end: number,
    family: number,
  ): Uint8Array;
  export function verifiedPayload(
    url: string,
    asset: any,
    request?: typeof fetch,
  ): Promise<Uint8Array>;
}
declare module "@device-contracts/*.json" {
  const value: any;
  export default value;
}
