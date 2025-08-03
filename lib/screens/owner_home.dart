import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'dart:convert';
import 'add_house_screen.dart';
import 'house_details.dart';
import 'login_screen.dart';

class OwnerHomeScreen extends StatelessWidget {
  final String? ownerId;
  const OwnerHomeScreen({super.key, this.ownerId});

  Future<List<DocumentSnapshot>> _getOwnerHouses() async {
    if (ownerId == null) {
      return [];
    }
    final querySnapshot = await FirebaseFirestore.instance
        .collection('houses')
        .where('ownerId', isEqualTo: ownerId)
        .get();
    return querySnapshot.docs;
  }

  void _logout(BuildContext context) async {
    await FirebaseAuth.instance.signOut();
    Navigator.pushAndRemoveUntil(
      context,
      MaterialPageRoute(builder: (_) => const LoginScreen()),
      (route) => false,
    );
  }

  void _goToAddHouse(BuildContext context) {
    Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => const AddHouseScreen()),
    );
  }

  void _openHouseDetails(BuildContext context, DocumentSnapshot house) {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => HouseDetailsScreen(house: house, ownerId: ownerId),
      ),
    );
  }

  // Helper method to get status color based on status value
  Color _getStatusColor(String status) {
    switch (status.toLowerCase()) {
      case 'cleaning':
      case 'assigned':
        return Colors.orange;
      case 'done':
        return Colors.green;
      case 'pending':
        return Colors.red;
      default:
        return Colors.grey;
    }
  }

  // Helper method to get status icon based on status value
  IconData _getStatusIcon(String status) {
    switch (status.toLowerCase()) {
      case 'cleaning':
        return Icons.cleaning_services;
      case 'assigned':
        return Icons.assignment;
      case 'done':
        return Icons.check_circle;
      case 'pending':
        return Icons.pending;
      default:
        return Icons.help;
    }
  }

  // Helper method to build status badge
  Widget _buildStatusBadge(String title, String status) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: _getStatusColor(status),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            _getStatusIcon(status),
            size: 16,
            color: Colors.white,
          ),
          const SizedBox(width: 4),
          Text(
            '$title: $status',
            style: const TextStyle(
              color: Colors.white,
              fontSize: 12,
              fontWeight: FontWeight.bold,
            ),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('My Houses'),
        actions: [
          IconButton(
            onPressed: () => _logout(context),
            icon: const Icon(Icons.logout),
          ),
        ],
      ),
      body: FutureBuilder<List<DocumentSnapshot>>(
        future: _getOwnerHouses(),
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          if (!snapshot.hasData || snapshot.data!.isEmpty) {
            return const Center(child: Text('No houses found.'));
          }

          final houses = snapshot.data!;
          return ListView.builder(
            padding: const EdgeInsets.all(16),
            itemCount: houses.length,
            itemBuilder: (context, index) {
              final house = houses[index];
              final houseData = house.data() as Map<String, dynamic>;
              final hasPending = houseData.containsKey('availabilityPending') &&
                  (houseData['availabilityPending'] as List).isNotEmpty;

              // Get cleaning status and other service statuses
              final cleaningStatus = houseData['cleaningStatus'] ?? 'unknown';
              final plumberStatus = houseData['plumberStatus'] ?? 'none';
              final electricianStatus = houseData['electricianStatus'] ?? 'none';
              final foodDeliveryStatus = houseData['foodDeliveryStatus'] ?? 'none';

              // Get house photos if available
              List<String> photos = [];
              if (houseData.containsKey('photosBase64') && 
                  houseData['photosBase64'] is List) {
                photos = List<String>.from(houseData['photosBase64']);
              }

              return Card(
                margin: const EdgeInsets.only(bottom: 16),
                elevation: 4,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
                child: InkWell(
                  onTap: () => _openHouseDetails(context, house),
                  borderRadius: BorderRadius.circular(12),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // House photo section
                      Container(
                        height: 200,
                        decoration: BoxDecoration(
                          color: Colors.grey[300],
                          borderRadius: const BorderRadius.vertical(top: Radius.circular(12)),
                        ),
                        child: photos.isNotEmpty && photos.first.isNotEmpty
                            ? ClipRRect(
                                borderRadius: const BorderRadius.vertical(top: Radius.circular(12)),
                                child: Image.memory(
                                  base64Decode(photos.first),
                                  fit: BoxFit.cover,
                                  width: double.infinity,
                                ),
                              )
                            : Container(
                                color: Colors.grey[300],
                                child: const Icon(
                                  Icons.home,
                                  size: 80,
                                  color: Colors.grey,
                                ),
                              ),
                      ),
                      Padding(
                        padding: const EdgeInsets.all(16),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            // House name and ID
                            Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                Expanded(
                                  child: Text(
                                    house['name'] ?? 'No Name',
                                    style: const TextStyle(
                                      fontSize: 20,
                                      fontWeight: FontWeight.bold,
                                    ),
                                  ),
                                ),
                                if (hasPending)
                                  Container(
                                    padding: const EdgeInsets.all(4),
                                    decoration: const BoxDecoration(
                                      color: Colors.red,
                                      shape: BoxShape.circle,
                                    ),
                                    child: const Icon(
                                      Icons.warning,
                                      color: Colors.white,
                                      size: 16,
                                    ),
                                  ),
                              ],
                            ),
                            const SizedBox(height: 8),
                            Text(
                              'ID: ${house.id}',
                              style: const TextStyle(
                                fontSize: 14,
                                color: Colors.grey,
                              ),
                            ),
                            const SizedBox(height: 16),
                            // Status badges
                            Wrap(
                              spacing: 8,
                              runSpacing: 8,
                              children: [
                                _buildStatusBadge('Cleaning', cleaningStatus),
                                _buildStatusBadge('Plumber', plumberStatus),
                                _buildStatusBadge('Electrician', electricianStatus),
                                _buildStatusBadge('Food', foodDeliveryStatus),
                              ],
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              );
            },
          );
        },
      ),
    );
  }
}
