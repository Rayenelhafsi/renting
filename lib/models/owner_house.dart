class OwnerHouse {
  final String id;
  final String title;
  final String? photoBase64;
  final String cleaningStatus;
  final String plumberStatus;
  final String electricianStatus;
  final String foodDeliveryStatus;
  final bool hasPending;
  final bool isFeatured;
  final String source; // "firebase" | "dwira_api"
  final Map<String, dynamic> raw;

  const OwnerHouse({
    required this.id,
    required this.title,
    required this.photoBase64,
    required this.cleaningStatus,
    required this.plumberStatus,
    required this.electricianStatus,
    required this.foodDeliveryStatus,
    required this.hasPending,
    required this.isFeatured,
    required this.source,
    required this.raw,
  });
}
