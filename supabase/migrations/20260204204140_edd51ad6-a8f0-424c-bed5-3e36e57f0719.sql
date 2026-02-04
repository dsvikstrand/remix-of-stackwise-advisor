-- Create public storage bucket for blueprint banners
INSERT INTO storage.buckets (id, name, public)
VALUES ('blueprint-banners', 'blueprint-banners', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Allow public read access to the bucket
CREATE POLICY "Public read access for blueprint banners"
ON storage.objects FOR SELECT
USING (bucket_id = 'blueprint-banners');

-- Allow authenticated users to upload (service role bypasses RLS anyway)
CREATE POLICY "Authenticated users can upload banners"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'blueprint-banners' AND auth.role() = 'authenticated');

-- Allow users to update their own uploads
CREATE POLICY "Users can update own banners"
ON storage.objects FOR UPDATE
USING (bucket_id = 'blueprint-banners' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Allow users to delete their own uploads
CREATE POLICY "Users can delete own banners"
ON storage.objects FOR DELETE
USING (bucket_id = 'blueprint-banners' AND auth.uid()::text = (storage.foldername(name))[1]);