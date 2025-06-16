import express from 'express';
// SupabaseClient is a type, so it's not needed in JS for import here.
// The supabase object is passed into the router factory.
import asyncHandler from 'express-async-handler';
import multer from 'multer';

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 3 * 1024 * 1024, // 3 MB limit per file
    },
    fileFilter: (req, file, cb) => {
        // Corrected the typo in the error message
        if (['image/jpeg', 'image/png', 'image/svg+xml', 'image/jpg'].includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Only JPEG, PNG, JPG, or SVG images are allowed.'));
        }
    }
});

// The RouterOptions interface is a TypeScript construct and is removed in JavaScript.
// export const createBrandingSettingsRouter = ({ supabase }: RouterOptions) => {
// The export statement is now directly applied to the function.
export const createBrandingSettingsRouter = ({ supabase }) => {
    const router = express.Router();

    const BRANDING_ASSETS_BUCKET = 'branding-assets';

    /**
     * Fetches existing branding settings or creates a new default record if none exist.
     * This ensures there's always a record to update.
     * @returns {Promise<Object>} The branding settings record.
     */
    async function getOrCreateBrandingSettingsRecord() {
        const { data, error } = await supabase
            .from('branding_settings')
            .select('*')
            .limit(1);

        if (error) {
            console.error('Error fetching branding settings:', error.message);
            throw new Error('Failed to fetch branding settings.');
        }

        if (data && data.length > 0) {
            return data[0];
        } else {
            const { data: newRecord, error: createError } = await supabase
                .from('branding_settings')
                .insert({})
                .select(); // Use .select() to return the inserted data

            if (createError) {
                console.error('Error creating initial branding settings record:', createError.message);
                throw new Error('Failed to create initial branding settings record.');
            }
            return newRecord[0];
        }
    }

    /**
     * Deletes an asset from Supabase Storage based on its public URL.
     * @param {string} url - The public URL of the asset to delete.
     * @returns {Promise<boolean>} True if deletion was successful or asset was not found, false otherwise.
     */
    async function deleteAssetFromStorage(url) { // Removed type annotations
        if (!url) return false;
        try {
            const publicUrlPrefix = `storage/v1/object/public/${BRANDING_ASSETS_BUCKET}/`;
            const pathStartIndex = url.indexOf(publicUrlPrefix);
            let fileNameInStorage = '';

            if (pathStartIndex !== -1) {
                fileNameInStorage = url.substring(pathStartIndex + publicUrlPrefix.length);
            } else {
                // Fallback: If URL format is unexpected, try to get the last segment
                const pathSegments = url.split('/');
                fileNameInStorage = pathSegments[pathSegments.length - 1];
                console.warn(`Could not parse full path from URL: ${url}. Assuming filename is "${fileNameInStorage}".`);
            }

            if (!fileNameInStorage) {
                console.warn(`No valid file name extracted from URL: ${url}`);
                return false;
            }

            const { error } = await supabase.storage
                .from(BRANDING_ASSETS_BUCKET)
                .remove([fileNameInStorage]);

            if (error) {
                // Handle cases where the asset might already be gone (e.g., 404 equivalent)
                if (error.message.includes('The resource was not found') || error.message.includes('not found')) {
                    console.log(`Asset ${fileNameInStorage} not found in storage (likely already deleted or never existed).`);
                    return true; // Treat as success if it's already gone
                }
                console.error(`Error deleting asset ${fileNameInStorage} from Supabase Storage:`, error.message);
                return false;
            }
            console.log(`Successfully deleted asset: ${fileNameInStorage}.`);
            return true;
        } catch (error) { // Removed `: any` type annotation
            console.error(`Unexpected error in deleteAssetFromStorage for URL ${url}:`, error);
            return false;
        }
    }


    // GET branding settings for the authenticated user
    router.get('/', asyncHandler(async (req, res) => { // Removed type annotations
        // The authenticateToken middleware should have added req.user
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ message: 'User not authenticated.' });
        }

        try {
            // Modify to fetch settings for the specific user
            const { data, error } = await supabase
                .from('branding_settings')
                .select('*')
                .eq('user_id', userId) // Filter by user ID
                .limit(1);

            let settings;
            if (error) {
                console.error('Error fetching branding settings:', error.message);
                // If there's an error, try to create a new record for the user
                // This assumes branding_settings has RLS to allow inserts by user_id
                const { data: newRecord, error: createError } = await supabase
                    .from('branding_settings')
                    .insert({ user_id: userId }) // Associate with current user
                    .select();

                if (createError) {
                    console.error('Error creating initial branding settings record for user:', createError.message);
                    throw new Error('Failed to fetch or create branding settings.');
                }
                settings = newRecord[0];
            } else if (data && data.length > 0) {
                settings = data[0];
            } else {
                // No settings found for the user, create a new one
                const { data: newRecord, error: createError } = await supabase
                    .from('branding_settings')
                    .insert({ user_id: userId }) // Associate with current user
                    .select();

                if (createError) {
                    console.error('Error creating initial branding settings record for user:', createError.message);
                    throw new Error('Failed to fetch or create branding settings.');
                }
                settings = newRecord[0];
            }

            res.status(200).json(settings);
        } catch (error) { // Removed type annotation
            console.error('Unexpected error in GET /api/branding-settings:', error.message);
            res.status(500).json({ error: 'Internal server error.', details: error.message });
        }
    }));

    // PUT (Update) branding settings - now handles files!
    router.put('/',
        upload.fields([
            { name: 'logoFile', maxCount: 1 },
            { name: 'signatureFile', maxCount: 1 }
        ]),
        asyncHandler(async (req, res) => { // Removed type annotations
            // The authenticateToken middleware should have added req.user
            const userId = req.user?.id;
            if (!userId) {
                return res.status(401).json({ message: 'User not authenticated.' });
            }

            const {
                name,
                invoicePrefix,
                phone,
                email,
                street,
                city,
                state,
                zip,
                country,
                // These are from formData. They will be strings "null" or actual URLs
                logoUrl: formDataLogoUrl,
                signatureUrl: formDataSignatureUrl,
                ...restOfBody
            } = req.body;

            // Access files directly from req.files, removing TypeScript type casting
            const logoFile = req.files?.logoFile?.[0];
            const signatureFile = req.files?.signatureFile?.[0];

            console.log('logo:', logoFile);
            console.log('signature:', signatureFile);

            let updatePayload = {
                name: name === 'null' ? null : name,
                invoicePrefix: invoicePrefix === 'null' ? null : invoicePrefix,
                phone: phone === 'null' ? null : phone,
                email: email === 'null' ? null : email,
                street: street === 'null' ? null : street,
                city: city === 'null' ? null : city,
                state: state === 'null' ? null : state,
                zip: zip === 'null' ? null : zip,
                country: country === 'null' ? null : country,
                ...restOfBody,
                user_id: userId // Ensure user_id is part of the payload
            };

            // Fetch existing settings for the current user
            const { data: existingSettings, error: fetchSettingsError } = await supabase
                .from('branding_settings')
                .select('*')
                .eq('user_id', userId)
                .single();

            if (fetchSettingsError || !existingSettings) {
                // This means no settings record exists for this user, which shouldn't happen if GET creates one
                // but adding a robust check here.
                console.error('Error fetching existing branding settings for update:', fetchSettingsError?.message);
                return res.status(404).json({ error: 'Branding settings not found for this user.' });
            }

            const settingsId = existingSettings.id;
            const oldLogoUrl = existingSettings.logoUrl;
            const oldSignatureUrl = existingSettings.signatureUrl;

            // Handle Logo File Upload/Deletion
            if (logoFile) {
                const fileName = `logo-${userId}-${Date.now()}-${logoFile.originalname.replace(/\s/g, '_')}`; // Include userId in filename
                const { data, error } = await supabase.storage
                    .from(BRANDING_ASSETS_BUCKET)
                    .upload(fileName, logoFile.buffer, {
                        contentType: logoFile.mimetype,
                        cacheControl: '3600',
                        upsert: true,
                    });

                if (error) {
                    console.error('Error uploading new logo:', error.message);
                    return res.status(500).json({ error: 'Failed to upload new logo.' });
                }
                const { data: publicUrlData } = supabase.storage.from(BRANDING_ASSETS_BUCKET).getPublicUrl(data.path);
                updatePayload.logoUrl = publicUrlData.publicUrl;

                if (oldLogoUrl && oldLogoUrl !== updatePayload.logoUrl) {
                    await deleteAssetFromStorage(oldLogoUrl);
                }
            } else if (formDataLogoUrl === 'null' && oldLogoUrl) {
                await deleteAssetFromStorage(oldLogoUrl);
                updatePayload.logoUrl = null;
            } else if (formDataLogoUrl && formDataLogoUrl !== 'null') {
                updatePayload.logoUrl = formDataLogoUrl;
            } else {
                updatePayload.logoUrl = oldLogoUrl; // Keep existing if no change
            }


            // Handle Signature File Upload/Deletion
            if (signatureFile) {
                const fileName = `signature-${userId}-${Date.now()}-${signatureFile.originalname.replace(/\s/g, '_')}`; // Include userId in filename
                const { data, error } = await supabase.storage
                    .from(BRANDING_ASSETS_BUCKET)
                    .upload(fileName, signatureFile.buffer, {
                        contentType: signatureFile.mimetype,
                        cacheControl: '3600',
                        upsert: true,
                    });

                if (error) {
                    console.error('Error uploading new signature:', error.message);
                    return res.status(500).json({ error: 'Failed to upload new signature.' });
                }
                const { data: publicUrlData } = supabase.storage.from(BRANDING_ASSETS_BUCKET).getPublicUrl(data.path);
                updatePayload.signatureUrl = publicUrlData.publicUrl;

                if (oldSignatureUrl && oldSignatureUrl !== updatePayload.signatureUrl) {
                    await deleteAssetFromStorage(oldSignatureUrl);
                }
            } else if (formDataSignatureUrl === 'null' && oldSignatureUrl) {
                await deleteAssetFromStorage(oldSignatureUrl);
                updatePayload.signatureUrl = null;
            } else if (formDataSignatureUrl && formDataSignatureUrl !== 'null') {
                updatePayload.signatureUrl = formDataSignatureUrl;
            } else {
                updatePayload.signatureUrl = oldSignatureUrl; // Keep existing if no change
            }

            // Update the branding_settings table
            try {
                const { data, error } = await supabase
                    .from('branding_settings')
                    .update(updatePayload)
                    .eq('id', settingsId)
                    .eq('user_id', userId) // IMPORTANT: Ensure update is for settings owned by this user
                    .select();

                if (error) {
                    console.error('Error updating branding settings in DB:', error.message);
                    throw new Error(error.message); // Throwing here will be caught by asyncHandler
                }
                if (!data || data.length === 0) {
                    res.status(404).json({ error: 'Branding settings record not found for this user after attempt to update.' });
                    return;
                }
                res.status(200).json(data[0]);
            } catch (error) { // Removed type annotation
                console.error('Unexpected error during DB update for branding settings:', error.message);
                res.status(500).json({ error: 'Internal server error.', details: error.message });
            }
        })
    );

    return router;
};
