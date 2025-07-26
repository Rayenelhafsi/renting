import 'dart:ui' as ui;
import 'dart:html' as html;

@pragma('vm:entry-point')
external dynamic get platformViewRegistry;

void registerQrViewFactory() {
  platformViewRegistry.registerViewFactory(
    'qr-view',
    (int viewId) => html.DivElement()
      ..style.width = '100%'
      ..style.height = '100%',
  );
}
