SELECT id,bien_id,proprietaire_id,request_type,status,owner_notified_at,owner_response_at,created_at FROM reservation_demands ORDER BY created_at DESC LIMIT 8;
SELECT id,owner_id,type,message,created_at FROM owner_mobile_notifications ORDER BY created_at DESC LIMIT 12;
