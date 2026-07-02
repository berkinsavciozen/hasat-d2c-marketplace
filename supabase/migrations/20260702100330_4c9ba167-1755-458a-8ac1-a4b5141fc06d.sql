
-- listing-photos
CREATE POLICY "listing-photos public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'listing-photos');

CREATE POLICY "listing-photos owner insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'listing-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "listing-photos owner update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'listing-photos' AND auth.uid()::text = (storage.foldername(name))[1])
  WITH CHECK (bucket_id = 'listing-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "listing-photos owner delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'listing-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

-- parcel-photos
CREATE POLICY "parcel-photos public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'parcel-photos');

CREATE POLICY "parcel-photos owner insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'parcel-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "parcel-photos owner update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'parcel-photos' AND auth.uid()::text = (storage.foldername(name))[1])
  WITH CHECK (bucket_id = 'parcel-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "parcel-photos owner delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'parcel-photos' AND auth.uid()::text = (storage.foldername(name))[1]);
