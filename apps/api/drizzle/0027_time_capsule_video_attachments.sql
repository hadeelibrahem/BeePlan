ALTER TABLE "time_capsule_attachments" DROP CONSTRAINT IF EXISTS "time_capsule_attachment_type_check";
ALTER TABLE "time_capsule_attachments" ADD CONSTRAINT "time_capsule_attachment_type_check" CHECK ("type" IN ('image','video','file','audio'));
