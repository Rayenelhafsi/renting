SELECT id,type,message,lu,created_at FROM admin_notifications ORDER BY created_at DESC LIMIT 5;
SELECT id,type,bien_id,event_at FROM client_interactions WHERE type IN ('reservation_attempt','reservation_submitted','partage') ORDER BY event_at DESC LIMIT 8;
