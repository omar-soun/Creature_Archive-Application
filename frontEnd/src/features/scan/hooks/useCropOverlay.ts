import { useState, useRef } from 'react';
import { PanResponder, Image } from 'react-native';
import ImageEditor from '@react-native-community/image-editor';

interface UseCropOverlayParams {
    capturedPhoto: string | null;
    setCapturedPhoto: (uri: string | null) => void;
    showAlert: (title: string, message?: string, buttons?: any[]) => void;
    screenDims: { width: number; height: number };
}

const CROP_HANDLE_HIT = 36;
const MIN_CROP_DIM = 80;

export const useCropOverlay = ({
    capturedPhoto,
    setCapturedPhoto,
    showAlert,
    screenDims,
}: UseCropOverlayParams) => {
    // Crop State
    const [isCropping, setIsCropping] = useState(false);
    const [cropBox, _setCropBox] = useState({ x: 0, y: 0, w: 0, h: 0 });
    const cropBoxRef = useRef({ x: 0, y: 0, w: 0, h: 0 });
    const imgBoundsRef = useRef({ x: 0, y: 0, w: 0, h: 0 });
    const imgNativeSizeRef = useRef({ w: 0, h: 0 });
    const dragRef = useRef({ mode: '', sx: 0, sy: 0, sbox: { x: 0, y: 0, w: 0, h: 0 } });

    const setCropBox = (box: { x: number; y: number; w: number; h: number }) => {
        cropBoxRef.current = box;
        _setCropBox(box);
    };

    const getHitZone = (px: number, py: number): string => {
        const c = cropBoxRef.current;
        const h = CROP_HANDLE_HIT;
        if (Math.abs(px - c.x) < h && Math.abs(py - c.y) < h) return 'tl';
        if (Math.abs(px - (c.x + c.w)) < h && Math.abs(py - c.y) < h) return 'tr';
        if (Math.abs(px - c.x) < h && Math.abs(py - (c.y + c.h)) < h) return 'bl';
        if (Math.abs(px - (c.x + c.w)) < h && Math.abs(py - (c.y + c.h)) < h) return 'br';
        if (px > c.x && px < c.x + c.w && py > c.y && py < c.y + c.h) return 'move';
        return '';
    };

    const clampBox = (box: { x: number; y: number; w: number; h: number }) => {
        const b = imgBoundsRef.current;
        const w = Math.min(Math.max(box.w, MIN_CROP_DIM), b.w);
        const h = Math.min(Math.max(box.h, MIN_CROP_DIM), b.h);
        return {
            x: Math.max(b.x, Math.min(box.x, b.x + b.w - w)),
            y: Math.max(b.y, Math.min(box.y, b.y + b.h - h)),
            w,
            h,
        };
    };

    const cropPanResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onMoveShouldSetPanResponder: () => true,
            onPanResponderGrant: (evt) => {
                const { pageX, pageY } = evt.nativeEvent;
                dragRef.current = {
                    mode: getHitZone(pageX, pageY),
                    sx: pageX,
                    sy: pageY,
                    sbox: { ...cropBoxRef.current },
                };
            },
            onPanResponderMove: (evt) => {
                const { pageX, pageY } = evt.nativeEvent;
                const d = dragRef.current;
                if (!d.mode) return;
                const dx = pageX - d.sx;
                const dy = pageY - d.sy;
                const s = d.sbox;
                let newBox = { ...s };

                switch (d.mode) {
                    case 'move':
                        newBox.x = s.x + dx;
                        newBox.y = s.y + dy;
                        break;
                    case 'tl': {
                        const nw = Math.max(MIN_CROP_DIM, s.w - dx);
                        const nh = Math.max(MIN_CROP_DIM, s.h - dy);
                        newBox.x = s.x + s.w - nw;
                        newBox.y = s.y + s.h - nh;
                        newBox.w = nw;
                        newBox.h = nh;
                        break;
                    }
                    case 'tr': {
                        const nh = Math.max(MIN_CROP_DIM, s.h - dy);
                        newBox.w = Math.max(MIN_CROP_DIM, s.w + dx);
                        newBox.y = s.y + s.h - nh;
                        newBox.h = nh;
                        break;
                    }
                    case 'bl': {
                        const nw = Math.max(MIN_CROP_DIM, s.w - dx);
                        newBox.x = s.x + s.w - nw;
                        newBox.w = nw;
                        newBox.h = Math.max(MIN_CROP_DIM, s.h + dy);
                        break;
                    }
                    case 'br':
                        newBox.w = Math.max(MIN_CROP_DIM, s.w + dx);
                        newBox.h = Math.max(MIN_CROP_DIM, s.h + dy);
                        break;
                }

                setCropBox(clampBox(newBox));
            },
            onPanResponderRelease: () => {
                dragRef.current.mode = '';
            },
        })
    ).current;

    const handleCropPhoto = () => {
        if (!capturedPhoto) return;
        Image.getSize(
            capturedPhoto,
            (imgW, imgH) => {
                const scale = Math.min(screenDims.width / imgW, screenDims.height / imgH);
                const dw = imgW * scale;
                const dh = imgH * scale;
                const dx = (screenDims.width - dw) / 2;
                const dy = (screenDims.height - dh) / 2;

                imgBoundsRef.current = { x: dx, y: dy, w: dw, h: dh };
                imgNativeSizeRef.current = { w: imgW, h: imgH };

                const pad = 20;
                const initBox = { x: dx + pad, y: dy + pad, w: dw - pad * 2, h: dh - pad * 2 };
                setCropBox(initBox);
                setIsCropping(true);
            },
            () => showAlert('Error', 'Could not load image dimensions.'),
        );
    };

    const handleCropConfirm = async () => {
        if (!capturedPhoto) return;
        try {
            const ib = imgBoundsRef.current;
            const ns = imgNativeSizeRef.current;
            const cb = cropBoxRef.current;

            const scaleX = ns.w / ib.w;
            const scaleY = ns.h / ib.h;
            const originX = Math.round((cb.x - ib.x) * scaleX);
            const originY = Math.round((cb.y - ib.y) * scaleY);
            const cropW = Math.round(cb.w * scaleX);
            const cropH = Math.round(cb.h * scaleY);

            const result = await ImageEditor.cropImage(capturedPhoto, {
                offset: { x: originX, y: originY },
                size: { width: cropW, height: cropH },
            });

            setCapturedPhoto(result.uri);
            setIsCropping(false);
        } catch (error) {
            showAlert('Crop Failed', 'Unable to crop the image.');
        }
    };

    const handleCropCancel = () => setIsCropping(false);

    return {
        isCropping,
        cropBox,
        cropPanResponder,
        handleCropPhoto,
        handleCropConfirm,
        handleCropCancel,
    };
};
