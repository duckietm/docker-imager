import { wrap } from 'bytebuffer';

export class BinaryReader
{
    private _position: number;
    private _dataView: ByteBuffer;

    constructor(buffer: ArrayBuffer)
    {
        this._position = 0;
        this._dataView = wrap(buffer);
    }

    public readByte(): number
    {
        return this._dataView.readInt8();
    }

    public readBytes(length: number): ByteBuffer
    {
        return this._dataView.readBytes(length);
    }

    public readShort(): number
    {
        return this._dataView.readInt16(this._position);
    }

    public readInt(): number
    {
        return this._dataView.readInt32(this._position);
    }

    public remaining(): number
    {
        return this._dataView.remaining();
    }

    public readString(length: number): string
    {
        const bytes = this.readBytes(length).toArrayBuffer();
        return new TextDecoder().decode(bytes);
    }

    // Ensure this returns only ArrayBuffer, handling both ArrayBuffer and SharedArrayBuffer properly
    public toArrayBuffer(): ArrayBuffer
    {
        // Check and return the correct ArrayBuffer
        const buffer = this._dataView.buffer;
        
        // Explicitly assert the type of buffer as ArrayBuffer or SharedArrayBuffer
        if (buffer instanceof ArrayBuffer) {
            return buffer;
        } else if (buffer instanceof SharedArrayBuffer) {
            // Return a new ArrayBuffer using byteLength
            return new ArrayBuffer((buffer as SharedArrayBuffer).byteLength); // Type assertion here
        }
        
        throw new Error('Unexpected buffer type');
    }

    public toString(encoding?: string): string
    {
        return new TextDecoder().decode(this._dataView.buffer);
    }
}
