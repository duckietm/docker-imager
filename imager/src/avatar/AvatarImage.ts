import { Canvas } from 'canvas';
import { CanvasUtilities, IGraphicAsset } from '../core';
import { ActiveActionData, IActionDefinition, IActiveActionData } from './actions';
import { AssetAliasCollection } from './alias';
import { IAnimationLayerData, IAvatarDataContainer, ISpriteDataContainer } from './animation';
import { AvatarFigureContainer } from './AvatarFigureContainer';
import { AvatarStructure } from './AvatarStructure';
import { AvatarImageCache } from './cache';
import { EffectAssetDownloadManager } from './EffectAssetDownloadManager';
import { AvatarAction, AvatarDirectionAngle, AvatarScaleType, AvatarSetType } from './enum';
import { IAvatarFigureContainer } from './IAvatarFigureContainer';
import { IAvatarImage } from './IAvatarImage';
import { IPartColor } from './structure';

export class AvatarImage implements IAvatarImage {
    private static CHANNELS_EQUAL: string = 'CHANNELS_EQUAL';
    private static CHANNELS_UNIQUE: string = 'CHANNELS_UNIQUE';
    private static CHANNELS_RED: string = 'CHANNELS_RED';
    private static CHANNELS_GREEN: string = 'CHANNELS_GREEN';
    private static CHANNELS_BLUE: string = 'CHANNELS_BLUE';
    private static CHANNELS_DESATURATED: string = 'CHANNELS_DESATURATED';
    private static DEFAULT_ACTION: string = 'Default';
    private static DEFAULT_DIRECTION: number = 2;
    private static DEFAULT_AVATAR_SET: string = AvatarSetType.FULL;

    protected _structure: AvatarStructure;
    protected _scale: string;
    protected _mainDirection: number;
    protected _headDirection: number;
    protected _mainAction: IActiveActionData;
    protected _disposed: boolean;
    protected _canvasOffsets: number[];
    protected _assets: AssetAliasCollection;
    protected _cache: AvatarImageCache;
    protected _figure: AvatarFigureContainer;
    protected _avatarSpriteData: IAvatarDataContainer;
    protected _actions: ActiveActionData[];

    private _defaultAction: IActiveActionData;
    private _frameCounter: number = 0;
    private _directionOffset: number = 0;
    private _sprites: ISpriteDataContainer[];
    private _isAnimating: boolean = false;
    private _animationHasResetOnToggle: boolean = false;
    private _actionsSorted: boolean = false;
    private _sortedActions: IActiveActionData[];
    private _lastActionsString: string;
    private _currentActionsString: string;
    private _effectIdInUse: number = -1;
    private _animationFrameCount: number;
    private _cachedBodyParts: string[];
    private _cachedBodyPartsDirection: number = -1;
    private _cachedBodyPartsGeometryType: string = null;
    private _cachedBodyPartsAvatarSet: string = null;
    private _effectManager: EffectAssetDownloadManager;

    constructor(k: AvatarStructure, _arg_2: AssetAliasCollection, _arg_3: AvatarFigureContainer, _arg_4: string, _arg_5: EffectAssetDownloadManager) {
        this._canvasOffsets = [];
        this._actions = [];
        this._cachedBodyParts = [];
        this._disposed = false;
        this._effectManager = _arg_5;
        this._structure = k;
        this._assets = _arg_2;
        this._scale = _arg_4;
        if (this._scale == null) {
            this._scale = AvatarScaleType.LARGE;
        }
        if (_arg_3 == null) {
            _arg_3 = new AvatarFigureContainer('hr-893-45.hd-180-2.ch-210-66.lg-270-82.sh-300-91.wa-2007-.ri-1-');
        }
        this._figure = _arg_3;
        this._cache = new AvatarImageCache(this._structure, this, this._assets, this._scale);
        this.setDirection(AvatarImage.DEFAULT_AVATAR_SET, AvatarImage.DEFAULT_DIRECTION);
        this._actions = [];
        this._defaultAction = new ActiveActionData(AvatarAction.POSTURE_STAND);
        this._defaultAction.definition = this._structure.getActionDefinition(AvatarImage.DEFAULT_ACTION);
        this.resetActions();
        this._animationFrameCount = 0;
    }

    public async dispose(): Promise<void> {
        if (this._disposed) return;

        this._structure = null;
        this._assets = null;
        this._mainAction = null;
        this._figure = null;
        this._avatarSpriteData = null;
        this._actions = null;

        if (this._cache) {
            this._cache.dispose();
            this._cache = null;
        }

        this._canvasOffsets = null;
        this._disposed = true;
    }

    public get disposed(): boolean {
        return this._disposed;
    }

    public getFigure(): IAvatarFigureContainer {
        return this._figure;
    }

    public getScale(): string {
        return this._scale;
    }

    public getPartColor(k: string): IPartColor {
        return this._structure.getPartColor(this._figure, k);
    }

    public setDirection(k: string, _arg_2: number): void {
        _arg_2 = (_arg_2 + this._directionOffset);

        if (_arg_2 < AvatarDirectionAngle.MIN_DIRECTION) {
            _arg_2 = (AvatarDirectionAngle.MAX_DIRECTION + (_arg_2 + 1));
        }

        if (_arg_2 > AvatarDirectionAngle.MAX_DIRECTION) {
            _arg_2 = (_arg_2 - (AvatarDirectionAngle.MAX_DIRECTION + 1));
        }

        if (this._structure.isMainAvatarSet(k)) {
            this._mainDirection = _arg_2;
        }

        if ((k === AvatarSetType.HEAD) || (k === AvatarSetType.FULL)) {
            if ((k === AvatarSetType.HEAD) && (this.isHeadTurnPreventedByAction())) {
                _arg_2 = this._mainDirection;
            }

            this._headDirection = _arg_2;
        }

        this._cache.setDirection(k, _arg_2);
    }

    public setDirectionAngle(k: string, _arg_2: number): void {
        this.setDirection(k, Math.floor(_arg_2 / 45));
    }

    public getSprites(): ISpriteDataContainer[] {
        return this._sprites;
    }

    public getCanvasOffsets(): number[] {
        return (this._canvasOffsets || [0, 0, 0]);
    }

    public getLayerData(k: ISpriteDataContainer): IAnimationLayerData {
        return this._structure.getBodyPartData(k.animation.id, this._frameCounter, k.id);
    }

    public updateAnimationByFrames(k: number = 1): void {
        this._frameCounter += k;
    }

    public resetAnimationFrameCounter(): void {
        this._frameCounter = 0;
    }

    public getTotalFrameCount(): number {
        const actions = this._sortedActions;

        let frames = this._animationFrameCount;

        for (const action of actions) {
            const animation = this._structure.animationManager.getAnimation(((action.definition.state + '.') + action.actionParameter));

            if (!animation) continue;

            const frameCount = animation.frameCount(action.overridingAction);
            console.log(`Animation ${action.definition.state}.${action.actionParameter} has ${frameCount} frames`); // Debug frame count
            frames = Math.max(frames, frameCount);
        }

        return frames;
    }

    private getFullImageCacheKey(): string {
        if (((this._sortedActions.length == 1) && (this._mainDirection == this._headDirection))) {
            return (this._mainDirection + this._currentActionsString) + (this._frameCounter % 4);
        }

        if (this._sortedActions.length == 2) {
            for (const k of this._sortedActions) {
                if (((k.actionType == 'fx') && ((((k.actionParameter == '33') || (k.actionParameter == '34')) || (k.actionParameter == '35')) || (k.actionParameter == '36')))) {
                    return (this._mainDirection + this._currentActionsString) + 0;
                }

                if (((k.actionType == 'fx') && ((k.actionParameter == '38') || (k.actionParameter == '39')))) {
                    return (((this._mainDirection + '_') + this._headDirection) + this._currentActionsString) + (this._frameCounter % 11);
                }

                if ((k.actionType === 'dance') && ((k.actionParameter === '1') || (k.actionParameter === '2') || (k.actionParameter === '3') || (k.actionParameter === '4'))) {
                    let frame = (this._frameCounter % 8);

                    if ((k.actionParameter === '3')) frame = (this._frameCounter % 10);

                    if ((k.actionParameter === '4')) frame = (this._frameCounter % 16);

                    return (((this._mainDirection + k.actionType) + k.actionParameter) + frame);
                }
            }
        }

        return null;
    }

    public getBodyParts(k: string, _arg_2: string, _arg_3: number): string[] {
        if (((_arg_3 !== this._cachedBodyPartsDirection) || (_arg_2 !== this._cachedBodyPartsGeometryType)) || (k !== this._cachedBodyPartsAvatarSet)) {
            this._cachedBodyPartsDirection = _arg_3;
            this._cachedBodyPartsGeometryType = _arg_2;
            this._cachedBodyPartsAvatarSet = k;
            this._cachedBodyParts = this._structure.getBodyParts(k, _arg_2, _arg_3);
        }
        return this._cachedBodyParts;
    }

    public getAvatarPartsForCamera(k: string): void {
        let _local_4: string;
        if (this._mainAction == null) {
            return;
        }
        const _local_2 = this._structure.getCanvas(this._scale, this._mainAction.definition.geometryType);
        if (_local_2 == null) {
            return;
        }
        const _local_3 = this.getBodyParts(k, this._mainAction.definition.geometryType, this._mainDirection);
        let _local_6 = (_local_3.length - 1);
        while (_local_6 >= 0) {
            _local_4 = _local_3[_local_6];
            const _local_5 = this._cache.getImageContainer(_local_4, this._frameCounter);
            _local_6--;
        }
    }

    public async getImage(setType: string, bgColor: number = 0, hightlight: boolean = false, scale: number = 1): Promise<Canvas> {
        if (!this._mainAction) return null;

        if (!this._actionsSorted) await this.endActionAppends();

        const avatarCanvas = this._structure.getCanvas(this._scale, this._mainAction.definition.geometryType);

        if (!avatarCanvas) return null;

        const bodyParts = this.getBodyParts(setType, this._mainAction.definition.geometryType, this._mainDirection);

        const canvas = CanvasUtilities.createNitroCanvas(avatarCanvas.width, avatarCanvas.height);
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height); // Ensure transparent canvas

        if (bgColor > 0) {
            ctx.fillStyle = `#${(`00000${(bgColor | 0).toString(16)}`).substr(-6)}`;
            ctx.fillRect(0, 0, avatarCanvas.width, avatarCanvas.height);
            ctx.fillStyle = null;
        } else {
            CanvasUtilities.prepareTransparentCanvas(canvas); // Apply transparent background
        }

        let partCount = (bodyParts.length - 1);

        while (partCount >= 0) {
            const set = bodyParts[partCount];
            const part = this._cache.getImageContainer(set, this._frameCounter);

            if (part) {
                const partCacheContainer = part.image;

                if (!partCacheContainer) return null;

                const point = part.regPoint.clone();

                if (point) {
                    point.x += avatarCanvas.offset.x;
                    point.y += avatarCanvas.offset.y;

                    point.x += avatarCanvas.regPoint.x;
                    point.y += avatarCanvas.regPoint.y;

                    ctx.save();
                    ctx.drawImage(part.image, point.x, point.y, part.image.width, part.image.height);
                    ctx.restore();
                }
            }

            partCount--;
        }

        if (scale !== 1) return CanvasUtilities.scaleCanvas(canvas, scale, scale);

        return canvas;
    }

    public getAsset(k: string): IGraphicAsset {
        return this._assets.getAsset(k);
    }

    public getDirection(): number {
        return this._mainDirection;
    }

    public initActionAppends(): void {
        this._actions = [];
        this._actionsSorted = false;
        this._currentActionsString = '';
    }

    public async endActionAppends(): Promise<void> {
        if (!this.sortActions()) return;

        for (const k of this._sortedActions) {
            if (k.actionType === AvatarAction.EFFECT) {
                if (!this._effectManager.isAvatarEffectReady(parseInt(k.actionParameter))) {
                    await this._effectManager.downloadAvatarEffect(parseInt(k.actionParameter));
                }
            }
        }

        this.resetActions();
        this.setActionsToParts();
        console.log(`After endActionAppends, sprite count: ${this._sprites.length}`);
    }

    public appendAction(k: string, ..._args: any[]): boolean {
        let _local_3 = '';
        this._actionsSorted = false;

        if (_args && (_args.length > 0)) _local_3 = _args[0];

        if ((_local_3 !== undefined) && (_local_3 !== null)) _local_3 = _local_3.toString();

        console.log(`Appending action: ${k}, parameter: ${_local_3}`); // Debug action appending

        switch (k) {
            case AvatarAction.POSTURE:
                switch (_local_3) {
                    case AvatarAction.POSTURE_LAY:
                    case AvatarAction.POSTURE_WALK:
                    case AvatarAction.POSTURE_STAND:
                    case AvatarAction.POSTURE_SWIM:
                    case AvatarAction.POSTURE_FLOAT:
                    case AvatarAction.POSTURE_SIT:
                    case AvatarAction.SNOWWAR_RUN:
                    case AvatarAction.SNOWWAR_DIE_FRONT:
                    case AvatarAction.SNOWWAR_DIE_BACK:
                    case AvatarAction.SNOWWAR_PICK:
                    case AvatarAction.SNOWWAR_THROW:
                        if ((_local_3 === AvatarAction.POSTURE_LAY)) {
                            if (this._mainDirection == 0) {
                                this.setDirection(AvatarSetType.FULL, 4);
                            } else {
                                this.setDirection(AvatarSetType.FULL, 2);
                            }
                        }
                        this.addActionData(_local_3);
                        break;
                }
                break;
            case AvatarAction.GESTURE:
                switch (_local_3) {
                    case AvatarAction.GESTURE_AGGRAVATED:
                    case AvatarAction.GESTURE_SAD:
                    case AvatarAction.GESTURE_SMILE:
                    case AvatarAction.GESTURE_SURPRISED:
                        this.addActionData(_local_3);
                        break;
                }
                break;
            case AvatarAction.EFFECT:
            case AvatarAction.DANCE:
            case AvatarAction.TALK:
            case AvatarAction.EXPRESSION_WAVE:
            case AvatarAction.SLEEP:
            case AvatarAction.SIGN:
            case AvatarAction.EXPRESSION_RESPECT:
            case AvatarAction.EXPRESSION_BLOW_A_KISS:
            case AvatarAction.EXPRESSION_LAUGH:
            case AvatarAction.EXPRESSION_CRY:
            case AvatarAction.EXPRESSION_IDLE:
            case AvatarAction.EXPRESSION_SNOWBOARD_OLLIE:
            case AvatarAction.EXPRESSION_SNOWBORD_360:
            case AvatarAction.EXPRESSION_RIDE_JUMP:
                this.addActionData(k, _local_3);
                break;
            case AvatarAction.CARRY_OBJECT:
            case AvatarAction.USE_OBJECT: {
                const _local_4 = this._structure.getActionDefinitionWithState(k);
                if (_local_4) _local_3 = _local_4.getParameterValue(_local_3);
                this.addActionData(k, _local_3);
                break;
            }
        }

        return true;
    }

    protected addActionData(k: string, _arg_2: string = ''): void {
        let _local_3: ActiveActionData;
        if (!this._actions) this._actions = [];

        let _local_4 = 0;
        while (_local_4 < this._actions.length) {
            _local_3 = this._actions[_local_4];
            if (((_local_3.actionType == k) && (_local_3.actionParameter == _arg_2))) {
                return;
            }
            _local_4++;
        }
        this._actions.push(new ActiveActionData(k, _arg_2, this._frameCounter));
    }

    public isAnimating(): boolean {
        return (this._isAnimating) || (this._animationFrameCount > 1);
    }

    private resetActions(): boolean {
        this._animationHasResetOnToggle = false;
        this._isAnimating = false;
        this._sprites = [];
        this._avatarSpriteData = null;
        this._directionOffset = 0;
        this._structure.removeDynamicItems(this);
        this._mainAction = this._defaultAction;
        this._mainAction.definition = this._defaultAction.definition;
        this.resetBodyPartCache(this._defaultAction);
        return true;
    }

    private isHeadTurnPreventedByAction(): boolean {
        let _local_2: IActionDefinition;
        let k: boolean;
        if (this._sortedActions == null) {
            return false;
        }
        for (const _local_3 of this._sortedActions) {
            _local_2 = this._structure.getActionDefinitionWithState(_local_3.actionType);
            if (((!(_local_2 == null)) && (_local_2.getPreventHeadTurn(_local_3.actionParameter)))) {
                k = true;
            }
        }
        return k;
    }

    private sortActions(): boolean {
        let _local_2: boolean;
        let _local_3: boolean;
        let _local_4: ActiveActionData;
        let k: boolean;

        this._currentActionsString = '';
        this._sortedActions = this._structure.sortActions(this._actions);
        this._animationFrameCount = this._structure.maxFrames(this._sortedActions);

        if (!this._sortedActions) {
            this._canvasOffsets = [0, 0, 0];

            if (this._lastActionsString !== '') {
                k = true;
                this._lastActionsString = '';
            }
        } else {
            this._canvasOffsets = this._structure.getCanvasOffsets(this._sortedActions, this._scale, this._mainDirection);
            console.log(`Canvas offsets for sorted actions: ${this._canvasOffsets}`); // Debug offsets

            for (const _local_4 of this._sortedActions) {
                this._currentActionsString = (this._currentActionsString + (_local_4.actionType + _local_4.actionParameter));

                if (_local_4.actionType === AvatarAction.EFFECT) {
                    const _local_5 = parseInt(_local_4.actionParameter);

                    if (this._effectIdInUse !== _local_5) _local_2 = true;

                    this._effectIdInUse = _local_5;
                    _local_3 = true;
                }
            }

            if (!_local_3) {
                if (this._effectIdInUse > -1) _local_2 = true;
                this._effectIdInUse = -1;
            }

            if (_local_2) this._cache.disposeInactiveActions(0);

            if (this._lastActionsString != this._currentActionsString) {
                k = true;
                this._lastActionsString = this._currentActionsString;
            }
        }

        this._actionsSorted = true;
        return k;
    }

    private setActionsToParts(): void {
        if (!this._sortedActions) return;

        this._sprites = [];
        const _local_4: string[] = [];

        for (const k of this._sortedActions) _local_4.push(k.actionType);

        for (const k of this._sortedActions) {
            console.log(`Processing action: ${k.actionType}, parameter: ${k.actionParameter}`); // Debug action
            if (k && k.definition && k.definition.isAnimation) {
                const animationId = `${k.definition.state}.${k.actionParameter}`;
                console.log(`Querying animation: ${animationId}`); // Debug animation query
                const _local_2 = this._structure.getAnimation(animationId);
                if (_local_2) {
                    console.log(`Animation found, spriteData length: ${(_local_2.spriteData || []).length}`); // Debug sprite data
                    this._sprites = this._sprites.concat(_local_2.spriteData || []);
                    if (_local_2.hasDirectionData()) this._directionOffset = _local_2.directionData.offset;
                    if (_local_2.hasAvatarData()) this._avatarSpriteData = _local_2.avatarData;
                } else {
                    console.log(`No animation for ${animationId}`);
                }

                if (_local_2 && _local_2.hasOverriddenActions()) {
                    const _local_5 = _local_2.overriddenActionNames();
                    if (_local_5) {
                        for (const _local_6 of _local_5) {
                            if (_local_4.indexOf(_local_6) >= 0) k.overridingAction = _local_2.overridingAction(_local_6);
                        }
                    }
                }

                if (_local_2 && _local_2.resetOnToggle) {
                    this._animationHasResetOnToggle = true;
                }
            }

            if (!((!(k)) || (!(k.definition)))) {
                if (k.definition.isAnimation && (k.actionParameter === '')) k.actionParameter = '1';
                this.setActionToParts(k, 0);
                if (k.definition.isAnimation) {
                    this._isAnimating = k.definition.isAnimated(k.actionParameter);
                }
            }
        }
    }

    private setActionToParts(k: IActiveActionData, _arg_2: number): void {
        if (((k == null) || (k.definition == null))) {
            return;
        }
        if (k.definition.assetPartDefinition == '') {
            return;
        }
        if (k.definition.isMain) {
            this._mainAction = k;
            this._cache.setGeometryType(k.definition.geometryType);
        }
        this._cache.setAction(k, _arg_2);
    }

    private resetBodyPartCache(k: IActiveActionData): void {
        if (!k) return;

        if (k.definition.assetPartDefinition === '') return;

        if (k.definition.isMain) {
            this._mainAction = k;
            this._cache.setGeometryType(k.definition.geometryType);
        }

        this._cache.resetBodyPartCache(k);
    }

    public get avatarSpriteData(): IAvatarDataContainer {
        return this._avatarSpriteData;
    }

    public isPlaceholder(): boolean {
        return false;
    }

    public forceActionUpdate(): void {
        this._lastActionsString = '';
    }

    public get animationHasResetOnToggle(): boolean {
        return this._animationHasResetOnToggle;
    }

    public get mainAction(): IActiveActionData {
        return this._mainAction;
    }
}