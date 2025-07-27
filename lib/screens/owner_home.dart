import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
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
        builder: (_) => HouseDetailsScreen(house: house),
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
            itemCount: houses.length,
            itemBuilder: (context, index) {
              final house = houses[index];
              final hasPending = (house.data() as Map<String, dynamic>)
                      .containsKey('availabilityPending') &&
                  ((house.data() as Map<String, dynamic>)['availabilityPending']
                          as List)
                      .isNotEmpty;
              return ListTile(
                title: Text(house['name']),
                subtitle: Text('ID: ${house.id}'),
                trailing: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    if (hasPending)
                      Container(
                        width: 12,
                        height: 12,
                        margin: const EdgeInsets.only(right: 8),
                        decoration: BoxDecoration(
                          color: Colors.red,
                          shape: BoxShape.circle,
                        ),
                      ),
                    const Icon(Icons.arrow_forward_ios),
                  ],
                ),
                onTap: () => _openHouseDetails(context, house),
              );
            },
          );
        },
      ),
      // Remove the floating action button to prevent owners from adding houses
      // floatingActionButton: FloatingActionButton(
      //   onPressed: () => _goToAddHouse(context),
      //   child: const Icon(Icons.add),
      // ),
    );
  }
}
