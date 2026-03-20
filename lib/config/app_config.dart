class AppConfig {
  const AppConfig._();

  // Enable with:
  // flutter run --dart-define=USE_DWIRA_API=true --dart-define=DWIRA_API_BASE_URL=http://127.0.0.1:3001
  static const bool useDwiraApi =
      bool.fromEnvironment('USE_DWIRA_API', defaultValue: true);

  static const String dwiraApiBaseUrl = String.fromEnvironment(
    'DWIRA_API_BASE_URL',
    defaultValue: 'http://localhost:3001',
  );
}
