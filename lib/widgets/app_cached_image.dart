import 'dart:typed_data';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

class AppCachedImage extends StatelessWidget {
  final String imageUrl;
  final Uint8List? memoryBytes;
  final BoxFit fit;
  final double? width;
  final double? height;
  final Widget? placeholder;
  final Widget? errorWidget;

  const AppCachedImage({
    super.key,
    this.imageUrl = '',
    this.memoryBytes,
    this.fit = BoxFit.cover,
    this.width,
    this.height,
    this.placeholder,
    this.errorWidget,
  });

  @override
  Widget build(BuildContext context) {
    if (memoryBytes != null) {
      return Image.memory(
        memoryBytes!,
        fit: fit,
        width: width,
        height: height,
        gaplessPlayback: true,
      );
    }

    final normalizedUrl = imageUrl.trim();
    if (normalizedUrl.isEmpty) {
      return _fallback();
    }

    return CachedNetworkImage(
      imageUrl: normalizedUrl,
      fit: fit,
      width: width,
      height: height,
      fadeInDuration: Duration.zero,
      fadeOutDuration: Duration.zero,
      placeholderFadeInDuration: Duration.zero,
      placeholder: (_, __) => placeholder ?? _fallback(),
      errorWidget: (_, __, ___) => _fallback(),
    );
  }

  Widget _fallback() => errorWidget ?? placeholder ?? const SizedBox.shrink();
}
