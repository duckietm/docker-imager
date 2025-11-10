import { Canvas, createCanvas } from 'canvas';
import { Request, Response } from 'express';
import { createWriteStream, writeFile, writeFileSync, existsSync, mkdirSync } from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { AvatarRenderManager, AvatarScaleType, IAvatarImage } from '../avatar';
import { File, FileUtilities, NitroLogger, Point } from '../core';
import {
    BuildFigureOptionsRequest,
    BuildFigureOptionsStringRequest,
    ProcessActionRequest,
    ProcessDanceRequest,
    ProcessDirectionRequest,
    ProcessEffectRequest,
    ProcessGestureRequest,
    RequestQuery
} from './utils';

export const HttpRouter = async (request: Request<any, any, any, RequestQuery>, response: Response) =>
{
    const query = request.query;

    try
    {
        const buildOptions = BuildFigureOptionsRequest(query);
        const saveDirectory = (process.env.AVATAR_SAVE_PATH as string);
        const directory = FileUtilities.getDirectory(saveDirectory);
        const avatarString = BuildFigureOptionsStringRequest(buildOptions);

        // Force APNG output
        buildOptions.imageFormat = 'apng';
        const saveFile = new File(`${directory.path}/${avatarString}.apng`);

        // Return cached file if it exists
        if(saveFile.exists())
        {
            const buffer = await FileUtilities.readFileAsBuffer(saveFile.path);
            if(buffer)
            {
                response
                    .writeHead(200, { 'Content-Type': 'image/apng' })
                    .end(buffer);
                return;
            }
        }

        if(buildOptions.effect > 0)
        {
            if(!AvatarRenderManager.instance.effectManager.isAvatarEffectReady(buildOptions.effect))
            {
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

        avatar.endActionAppends();

        const tempCanvas = createCanvas((avatarCanvas.width * buildOptions.size), (avatarCanvas.height * buildOptions.size));
        const tempCtx = tempCanvas.getContext('2d');

        // Determine total frames
        let totalFrames = 1;
        if(avatar.getTotalFrameCount() > 0) totalFrames = avatar.getTotalFrameCount() * 2;

        // Temporary frame directory
        const tempDir = path.join('/tmp', `avatar_frames_${Date.now()}`);
        mkdirSync(tempDir, { recursive: true });

        for(let i = 0; i < totalFrames; i++)
        {
            tempCtx.clearRect(0, 0, tempCanvas.width, tempCanvas.height);

            if(totalFrames && (i > 0)) avatar.updateAnimationByFrames(1);

            const canvas = await avatar.getImage(buildOptions.setType, 0, false, buildOptions.size);

            const avatarOffset = new Point();
            let canvasOffsets = avatar.getCanvasOffsets();
            if(!canvasOffsets || !canvasOffsets.length) canvasOffsets = [ 0, 0, 0 ];

            avatarOffset.x = ((((-1 * 64) / 2) + canvasOffsets[0]) - ((canvas.width - 64) / 2));
            avatarOffset.y = (((-(canvas.height) + (64 / 4)) + canvasOffsets[1]));

            const otherOffset = new Point(0, -16);

            ProcessAvatarSprites(tempCanvas, avatar, otherOffset, false);

            tempCtx.save();
            tempCtx.drawImage(canvas, ((canvas.width / 2) + avatarOffset.x), (canvas.height + avatarOffset.y) + otherOffset.y, canvas.width, canvas.height);
            tempCtx.restore();

            ProcessAvatarSprites(tempCanvas, avatar, otherOffset, true);

            // Save each frame as PNG
            const framePath = path.join(tempDir, `frame_${i.toString().padStart(3, '0')}.png`);
            writeFileSync(framePath, tempCanvas.toBuffer('image/png'));
        }

        // Combine frames into APNG using ffmpeg
        try
        {
            execSync(
				`ffmpeg -y -framerate 6 -pattern_type sequence -i ${tempDir}/frame_%03d.png ` + 
				`-plays 0 -compression_level 9 -vf "fps=6,format=rgba" ${saveFile.path}`, { stdio: 'ignore' }
			);
        }
        catch (err)
        {
            NitroLogger.error(`FFmpeg APNG generation failed: ${err}`);
            response.writeHead(500).end();
            return;
        }

        const buffer = await FileUtilities.readFileAsBuffer(saveFile.path);

        response
            .writeHead(200, { 'Content-Type': 'image/apng' })
            .end(buffer);
    }
    catch (err)
    {
        NitroLogger.error(err.message);
        response.writeHead(500).end();
    }
};

function ProcessAvatarSprites(canvas: Canvas, avatar: IAvatarImage, offset: Point, frontSprites: boolean = true)
{
    const ctx = canvas.getContext('2d');

    for(const sprite of avatar.getSprites())
    {
        const layerData = avatar.getLayerData(sprite);

        let offsetX = sprite.getDirectionOffsetX(avatar.getDirection());
        let offsetY = sprite.getDirectionOffsetY(avatar.getDirection());
        const offsetZ = sprite.getDirectionOffsetZ(avatar.getDirection());
        let direction = 0;
        let frame = 0;

        if(!frontSprites)
        {
            if(offsetZ >= 0) continue;
        }
        else if(offsetZ < 0) continue;

        if(sprite.hasDirections) direction = avatar.getDirection();

        if(layerData)
        {
            frame = layerData.animationFrame;
            offsetX += layerData.dx;
            offsetY += layerData.dy;
            direction += layerData.dd;
        }

        if(direction < 0) direction = (direction + 8);
        else if(direction > 7) direction = (direction - 8);

        const assetName = `${avatar.getScale()}_${sprite.member}_${direction}_${frame}`;
        const asset = avatar.getAsset(assetName);

        if(!asset) continue;

        const texture = asset.texture;

        const x = (((canvas.width / 2) + asset.offsetX) - (64 / 2)) + offsetX + offset.x;
        const y = ((canvas.height + asset.offsetY) + offsetY) + offset.y;

        ctx.save();

        if(sprite.ink === 33) ctx.globalCompositeOperation = 'lighter';

        ctx.drawImage(texture.drawableCanvas, x, y, texture.width, texture.height);

        ctx.restore();
    }
}
