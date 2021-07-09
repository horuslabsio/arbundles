import base64url from "base64url";
import { Buffer } from "buffer";
import { arraybufferEqual, byteArrayToLong } from "./utils";
import DataItem from "./DataItem";
import Transaction, { Tag } from "arweave/node/lib/transaction";
import Arweave from "arweave";

const HEADER_START = 32;

export default class Bundle {
  readonly binary: Uint8Array;

  constructor(binary: Uint8Array, verify?: boolean) {
    // TODO: Add some verification
    if (verify) {
      if (!Bundle._verify(binary)) throw new Error("Binary not valid bundle");
    }

    this.binary = binary;
  }

  public get length() { return this.getDataItemCount(); }

  /**
   * Get a DataItem by index (`number`) or by txId (`string`)
   * @param index
   */
  public get(index: number | string) {
    if (typeof index === "number") {
      if (index > this.length) {
        throw new RangeError("Index out of range");
      }

      return this.getByIndex(index);
    } else {
      return this.getById(index);
    }
  }

  public getAll(): DataItem[] {
    const items = new Array(this.length);
    let offset = 0;
    const bundleStart = this.getBundleStart();

    let counter = 0;
    for (let i = HEADER_START; i < (HEADER_START + (64 * this.length)); i+=64) {
      const _offset = byteArrayToLong(this.binary.slice(i, i + 32))

      const dataItemStart = bundleStart + offset;
      const bytes = this.binary.slice(dataItemStart, dataItemStart + _offset);

      offset += _offset;

      items[counter] = new DataItem(bytes);

      counter++;
    }
    return items;
  }

  public toTransaction(arweave: Arweave): Promise<Transaction> {
    return arweave.createTransaction({
      data: this.binary,
      tags: [
        new Tag("Bundle-Format", "binary"),
        new Tag("Bundle-Version", "2.0.0"),
      ]
    });
  }

  public verify(): boolean {
    return Bundle._verify(this.binary);
  }

  private static _verify(_: Uint8Array): boolean {
    return true;
  }

  private getOffset(id: Uint8Array): { startOffset: number, size: number } {
    let offset = 0;
    for (let i = HEADER_START; i < (HEADER_START + (64 * this.length)); i+=64) {
      const _offset = byteArrayToLong(this.binary.slice(i, i + 32))
      offset += _offset;
      const _id = this.binary.slice(i + 32, i + 64);


      if (arraybufferEqual(_id, id)) {
        return { startOffset: offset, size: _offset };
      }
    }

    return { startOffset: -1, size: -1 };
  }

  // TODO: Test this
  /**
   * UNSAFE! Assumes index < length
   * @param index
   * @private
   */
  private getByIndex(index: number) {
    let offset = 0;

    const headerStart = 32 + (64 * index);
    const dataItemSize = byteArrayToLong(this.binary.slice(headerStart, headerStart + 32))

    let counter = 0;
    for (let i = HEADER_START; i < (HEADER_START + (64 * this.length)); i+=64) {
      if (counter == index) {
        break;
      }

      const _offset = byteArrayToLong(this.binary.slice(i, i + 32));
      offset += _offset;

      counter++;
    }

    const bundleStart = this.getBundleStart();
    const dataItemStart = bundleStart + offset;
    return new DataItem(this.binary.slice(dataItemStart, dataItemStart + dataItemSize));
  }

  private getById(id: string): DataItem {
    const _id = Uint8Array.from(Buffer.from(base64url.decode(id, "hex")));

    const offset = this.getOffset(_id);
    if (offset.startOffset == -1) {
      throw new Error("Transaction not found");
    }

    const bundleStart = this.getBundleStart();
    const dataItemStart = bundleStart + offset.startOffset;
    return new DataItem(this.binary.slice(dataItemStart, dataItemStart + offset.size))
  }

  private getDataItemCount(): number {
    return byteArrayToLong(this.binary.slice(0, 32));
  }

  private getBundleStart(): number {
    return 32 + (64 * this.length);
  }
}