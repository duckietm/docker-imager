import { Canvas, createCanvas } from 'canvas';
import { Request, Response } from 'express';
import { createWriteStream, writeFile, WriteStream } from 'fs';
import GIFEncoder from 'gifencoder';
import { AvatarRenderManager, AvatarScaleType, IAvatarImage } from '../avatar';
import { CanvasUtilities, File, FileUtilities, NitroLogger, Point } from '../core';
import { BuildFigureOptionsRequest, BuildFigureOptionsStringRequest, ProcessActionRequest, ProcessDanceRequest, ProcessDirectionRequest, ProcessEffectRequest, ProcessGestureRequest, RequestQuery } from './utils';

export const HttpRouter = async (request: Request<any, any, any, RequestQuery>, response: Response) => {
    const query = request.query;

    try {
        const buildOptions = BuildFigureOptionsRequest(query);
        const saveDirectory = (process.env.AVATAR_SAVE_PATH as string);
        const directory = FileUtilities.getDirectory(saveDirectory);
        const avatarString = BuildFigureOptionsStringRequest(buildOptions);
        const saveFile = new File(`${directory.path}/${avatarString}.${buildOptions.imageFormat}`);

        if (saveFile.exists()) {
            const buffer = await FileUtilities.readFileAsBuffer(saveFile.path);

            if (buffer) {
                response
                    .writeHead(200, {
                        'Content-Type': ((buildOptions.imageFormat === 'gif') ? 'image/gif' : 'image/png')
                    })
                    .end(buffer);
            }

            return;
        }

        if (buildOptions.effect > 0) {
            if (!AvatarRenderManager.instance.effectManager.isAvatarEffectReady(buildOptions.effect)) {
                await AvatarRenderManager.instance.effectManager.downloadAvatarEffect(buildOptions.effect);
            }
        }

        const avatar = await AvatarRenderManager.instance.createAvatarImage(buildOptions.figure, AvatarScaleType.LARGE, 'M');
        const avatarCanvas = AvatarRenderManager.instance.structure.getCanvas(avatar.getScale(), avatar.mainAction.definition.geometryType);

        ProcessDirectionRequest(query, avatar);

        avatar.initActionAppends();

        ProcessActionRequest(query, avatar);
        ProcessGestureRequest(query, avatar);
        ProcessDanceRequest(query, avatar);
        ProcessEffectRequest(query, avatar);

        await avatar.endActionAppends();

        const tempCanvas = createCanvas((avatarCanvas.width * buildOptions.size), (avatarCanvas.height * buildOptions.size));
        CanvasUtilities.prepareTransparentCanvas(tempCanvas); // Ensure transparent canvas
        const tempCtx = tempCanvas.getContext('2d');

        let encoder: GIFEncoder = null;
        let stream: WriteStream = null;

        if (buildOptions.imageFormat === 'gif') {
            encoder = new GIFEncoder(tempCanvas.width, tempCanvas.height);
            stream = encoder.createReadStream().pipe(createWriteStream(saveFile.path));

            encoder.start();
            encoder.setRepeat(0);
            encoder.setDelay(200); // 5 FPS
            encoder.setQuality(5); // High quality
            encoder.setTransparent(0xFFFF00FF); // Magenta for transparency
        }

        let totalFrames = 0;

        if (buildOptions.imageFormat !== 'gif') {
            if (buildOptions.frameNumber > 0) avatar.updateAnimationByFrames(buildOptions.frameNumber);
            totalFrames = 1;
        } else {
            totalFrames = avatar.getTotalFrameCount();
        }

	for (let i = 0; i < totalFrames; i++) {
    // Clear canvas and ensure magenta background
    tempCtx.clearRect(0, 0, tempCanvas.width, tempCanvas.height);
    CanvasUtilities.prepareTransparentCanvas(tempCanvas); // Sets magenta #FF00FF

    if (totalFrames && i > 0) avatar.updateAnimationByFrames(1);

    const canvas = await avatar.getImage(buildOptions.setType, 0, false, buildOptions.size);

    const avatarOffset = new Point();

    let canvasOffsets = avatar.getCanvasOffsets();
    if (!canvasOffsets || !canvasOffsets.length) {
        console.warn(`Frame ${i} using default offsets`);
        canvasOffsets = [0, 0, 0];
    }
    console.log(`Frame ${i} offsets: ${canvasOffsets}`);

    avatarOffset.x = canvasOffsets[0];
    avatarOffset.y = canvasOffsets[1];

    const otherOffset = new Point(0, -16);

    ProcessAvatarSprites(tempCanvas, avatar, otherOffset, false);

    tempCtx.save();
    console.log(`Frame ${i} canvas size: ${canvas.width}x${canvas.height}`);
    console.log(`Frame ${i} sprite count: ${avatar.getSprites().length}`);
    const bodyParts = avatar.getBodyParts(buildOptions.setType, avatar.mainAction.definition.geometryType, buildOptions.direction);
    console.log(`Frame ${i} body parts from getImage: ${bodyParts}`);

    // Debug: Log background pixel data before drawing
    const preDrawPixelData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height).data;
    console.log(`Frame ${i} pre-draw pixel data sample (top-left): ${preDrawPixelData.slice(0, 16)}`);

    tempCtx.drawImage(canvas, avatarOffset.x, avatarOffset.y + otherOffset.y, canvas.width, canvas.height);
    tempCtx.restore();

    ProcessAvatarSprites(tempCanvas, avatar, otherOffset, true);

    // Debug: Log pixel data after drawing
    const postDrawPixelData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height).data;
    console.log(`Frame ${i} post-draw pixel data sample (top-left): ${postDrawPixelData.slice(0, 16)}`);

    if (encoder) {
        encoder.addFrame(tempCtx as any);
        const fs = require('fs');
        // fs.writeFileSync(`debug_frame_${i}.png`, tempCanvas.toBuffer()); <== To debug the output per frame
        // console.log(`Saved debug_frame_${i}.png`);
    } else {
        const buffer = tempCanvas.toBuffer();

        response
            .writeHead(200, {
                'Content-Type': 'image/png'
            })
            .end(buffer);

        writeFile(saveFile.path, buffer, (err) => {
            if (err) NitroLogger.error(err.message);
        });

        return;
		}
	}

        if (encoder) encoder.finish();

        if (stream) {
            await new Promise<void>((resolve, reject) => {
                stream.on('finish', () => resolve());
                stream.on('error', reject);
            });
        }

        const buffer = await FileUtilities.readFileAsBuffer(saveFile.path);

        response
            .writeHead(200, {
                'Content-Type': 'image/gif'
            })
            .end(buffer);
    } catch (err) {
        NitroLogger.error(err.message);

        response
            .writeHead(500)
            .end();
    }
};

function ProcessAvatarSprites(canvas: Canvas, avatar: IAvatarImage, offset: Point, frontSprites: boolean = true) {
    const ctx = canvas.getContext('2d');

    for (const sprite of avatar.getSprites()) {
        const layerData = avatar.getLayerData(sprite);

        let offsetX = sprite.getDirectionOffsetX(avatar.getDirection());
        let offsetY = sprite.getDirectionOffsetY(avatar.getDirection());
        const offsetZ = sprite.getDirectionOffsetZ(avatar.getDirection());
        let direction = 0;
        let frame = 0;

        if (!frontSprites) {
            if (offsetZ >= 0) continue;
        } else if (offsetZ < 0) continue;

        if (sprite.hasDirections) direction = avatar.getDirection();

        if (layerData) {
            frame = layerData.animationFrame;
            offsetX += layerData.dx;
            offsetY += layerData.dy;
            direction += layerData.dd;
        }

        if (direction < 0) direction = (direction + 8);
        else if (direction > 7) direction = (direction - 8);

        const assetName = ((((((avatar.getScale() + '_') + sprite.member) + '_') + direction) + '_') + frame);
        const asset = avatar.getAsset(assetName);

        if (!asset) continue;

        const texture = asset.texture;

        const x = ((((canvas.width / 2) + asset.offsetX) - (64 / 2)) + offsetX) + offset.x;
        const y = ((canvas.height + asset.offsetY) + offsetY) + offset.y;

        ctx.save();

        if (sprite.ink === 33) ctx.globalCompositeOperation = 'lighter';

        ctx.drawImage(texture.drawableCanvas, x, y, texture.width, texture.height);

        ctx.restore();
    }
}
