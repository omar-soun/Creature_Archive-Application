import React, { useState, useRef, useCallback } from 'react';
import {
  Modal,
  View,
  Image,
  TouchableOpacity,
  Text,
  StyleSheet,
  Dimensions,
  PanResponder,
  ActivityIndicator,
} from 'react-native';
import ImageEditor from '@react-native-community/image-editor';

interface ImageCropModalProps {
  visible: boolean;
  imageUri: string;
  imageWidth: number;
  imageHeight: number;
  onCropComplete: (croppedUri: string) => void;
  onCancel: () => void;
}

const SCREEN_WIDTH = Dimensions.get('window').width;
const CROP_SIZE = SCREEN_WIDTH * 0.75;
const CROP_BORDER_RADIUS = 30;

const ImageCropModal: React.FC<ImageCropModalProps> = ({
  visible,
  imageUri,
  imageWidth,
  imageHeight,
  onCropComplete,
  onCancel,
}) => {
  const [isCropping, setIsCropping] = useState(false);

  // Calculate scale so the image covers the crop area (cover fit)
  const aspectRatio = imageWidth / imageHeight;
  let displayWidth: number;
  let displayHeight: number;

  if (aspectRatio > 1) {
    // Landscape: height fits crop size, width overflows
    displayHeight = CROP_SIZE;
    displayWidth = CROP_SIZE * aspectRatio;
  } else {
    // Portrait or square: width fits crop size, height overflows
    displayWidth = CROP_SIZE;
    displayHeight = CROP_SIZE / aspectRatio;
  }

  // Max pan bounds (how far the image can move)
  const maxPanX = Math.max(0, (displayWidth - CROP_SIZE) / 2);
  const maxPanY = Math.max(0, (displayHeight - CROP_SIZE) / 2);

  const pan = useRef({ x: 0, y: 0 });
  const [panState, setPanState] = useState({ x: 0, y: 0 });

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        // Store current position at gesture start
      },
      onPanResponderMove: (_, gestureState) => {
        const newX = Math.max(-maxPanX, Math.min(maxPanX, pan.current.x + gestureState.dx));
        const newY = Math.max(-maxPanY, Math.min(maxPanY, pan.current.y + gestureState.dy));
        setPanState({ x: newX, y: newY });
      },
      onPanResponderRelease: (_, gestureState) => {
        pan.current = {
          x: Math.max(-maxPanX, Math.min(maxPanX, pan.current.x + gestureState.dx)),
          y: Math.max(-maxPanY, Math.min(maxPanY, pan.current.y + gestureState.dy)),
        };
      },
    })
  ).current;

  const handleCrop = useCallback(async () => {
    setIsCropping(true);
    try {
      // Convert pan offset (in display coords) to original image coords
      const scaleX = imageWidth / displayWidth;
      const scaleY = imageHeight / displayHeight;

      // Center of image is at (displayWidth/2, displayHeight/2)
      // Crop area top-left in display coords relative to image:
      // image center is offset by (-panState.x, -panState.y) from crop center
      const cropDisplayX = (displayWidth - CROP_SIZE) / 2 - panState.x;
      const cropDisplayY = (displayHeight - CROP_SIZE) / 2 - panState.y;

      const offsetX = Math.max(0, Math.round(cropDisplayX * scaleX));
      const offsetY = Math.max(0, Math.round(cropDisplayY * scaleY));
      const cropW = Math.round(CROP_SIZE * scaleX);
      const cropH = Math.round(CROP_SIZE * scaleY);

      const result = await ImageEditor.cropImage(imageUri, {
        offset: { x: offsetX, y: offsetY },
        size: {
          width: Math.min(cropW, imageWidth - offsetX),
          height: Math.min(cropH, imageHeight - offsetY),
        },
        displaySize: { width: 500, height: 500 },
        quality: 0.8,
        format: 'jpeg',
      });

      onCropComplete(result.uri);
    } catch (error) {
      console.error('Crop failed:', error);
      // Fall back to uncropped image
      onCropComplete(imageUri);
    } finally {
      setIsCropping(false);
    }
  }, [imageUri, imageWidth, imageHeight, displayWidth, displayHeight, panState, onCropComplete]);

  const handleCancel = useCallback(() => {
    pan.current = { x: 0, y: 0 };
    setPanState({ x: 0, y: 0 });
    onCancel();
  }, [onCancel]);

  return (
    <Modal visible={visible} animationType="slide" statusBarTranslucent>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={handleCancel} style={styles.headerBtn} disabled={isCropping}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Move and Scale</Text>
          <TouchableOpacity onPress={handleCrop} style={[styles.headerBtn, styles.chooseBtn]} disabled={isCropping}>
            {isCropping ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <Text style={styles.chooseText}>Choose</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Crop Area */}
        <View style={styles.cropWrapper}>
          {/* Image behind the mask */}
          <View style={styles.imageContainer} {...panResponder.panHandlers}>
            <Image
              source={{ uri: imageUri }}
              style={{
                width: displayWidth,
                height: displayHeight,
                transform: [
                  { translateX: panState.x },
                  { translateY: panState.y },
                ],
              }}
              resizeMode="cover"
            />
          </View>

          {/* Dark overlay with transparent square cutout */}
          <View style={styles.overlayContainer} pointerEvents="none">
            {/* Top */}
            <View style={styles.overlayDark} />
            {/* Middle row */}
            <View style={styles.middleRow}>
              <View style={styles.overlayDark} />
              <View style={[styles.cropHole, { width: CROP_SIZE, height: CROP_SIZE }]}>
                <View style={styles.cropBorder} />
              </View>
              <View style={styles.overlayDark} />
            </View>
            {/* Bottom */}
            <View style={styles.overlayDark} />
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 54,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  headerBtn: {
    padding: 8,
    minWidth: 70,
    alignItems: 'center',
  },
  cancelText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '500',
  },
  title: {
    color: '#FFF',
    fontSize: 17,
    fontWeight: '600',
  },
  chooseBtn: {
    backgroundColor: '#059669',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  chooseText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  cropWrapper: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageContainer: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
  },
  overlayContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  overlayDark: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignSelf: 'stretch',
  },
  middleRow: {
    flexDirection: 'row',
    height: CROP_SIZE,
  },
  cropHole: {
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cropBorder: {
    width: '100%',
    height: '100%',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.5)',
    borderRadius: CROP_BORDER_RADIUS,
  },
});

export default ImageCropModal;
