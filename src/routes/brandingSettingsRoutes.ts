// src/routes/brandingSettingsRoutes.ts
import express from 'express';
import { SupabaseClient } from '@supabase/supabase-js';
import asyncHandler from 'express-async-handler';
import multer from 'multer';

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 3 * 1024 * 1024, // MB limit per file
    },
    fileFilter: (req, file, cb) => {
        if (['image/jpeg', 'image/png', 'image/svg+xml', 'image/jpg','image/png'].includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Only  or SVG are allowed.'));
        }
    }
});

interface RouterOptions {
    supabase: SupabaseClient;
    // authenticateToken: express.RequestHandler; // uncomment when adding auth
}

export const createBrandingSettingsRouter = ({ supabase }: RouterOptions) => {
    const router = express.Router();

    const BRANDING_ASSETS_BUCKET = 'branding-assets';

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
                .select();

            if (createError) {
                console.error('Error creating initial branding settings record:', createError.message);
                throw new Error('Failed to create initial branding settings record.');
            }
            return newRecord[0];
        }
    }

    async function deleteAssetFromStorage(url: string): Promise<boolean> {
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
                // Supabase StorageError might not have statusCode directly, check message
                if (error.message.includes('The resource was not found') || error.message.includes('not found')) {
                    console.log(`Asset ${fileNameInStorage} not found in storage (likely already deleted or never existed).`);
                    return true; // Treat as success if it's already gone
                }
                console.error(`Error deleting asset ${fileNameInStorage} from Supabase Storage:`, error.message);
                return false;
            }
            console.log(`Successfully deleted asset: ${fileNameInStorage}.`);
            return true;
        } catch (error) {
            console.error(`Unexpected error in deleteAssetFromStorage for URL ${url}:`, error);
            return false;
        }
    }


    // GET branding settings
    router.get('/', asyncHandler(async (req, res) => {
        try {
            const settings = await getOrCreateBrandingSettingsRecord();
            res.status(200).json(settings);
            // No explicit return here, asyncHandler handles Promise<void>
        } catch (error: any) {
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
        asyncHandler(async (req, res) => {
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
const logoFile = (req.files as { [fieldname: string]: Express.Multer.File[] })?.logoFile?.[0];
const signatureFile = (req.files as { [fieldname: string]: Express.Multer.File[] })?.signatureFile?.[0];

            const logo = (req.files as any)?.logoFile?.[0];
const signature = (req.files as any)?.signatureFile?.[0];

console.log('logo:', logo);
console.log('signature:', signature);
            let updatePayload: Record<string, any> = {
                name: name === 'null' ? null : name,
                invoicePrefix: invoicePrefix === 'null' ? null : invoicePrefix,
                phone: phone === 'null' ? null : phone,
                email: email === 'null' ? null : email,
                street: street === 'null' ? null : street,
                city: city === 'null' ? null : city,
                state: state === 'null' ? null : state,
                zip: zip === 'null' ? null : zip,
                country: country === 'null' ? null : country,
                ...restOfBody
            };

            const existingSettings = await getOrCreateBrandingSettingsRecord();
            const settingsId = existingSettings.id;
            const oldLogoUrl = existingSettings.logoUrl;
            const oldSignatureUrl = existingSettings.signatureUrl;

            // Handle Logo File Upload/Deletion
            if (logoFile) {
                const fileName = `logo-${Date.now()}-${logoFile.originalname.replace(/\s/g, '_')}`;
                const { data, error } = await supabase.storage
                    .from(BRANDING_ASSETS_BUCKET)
                    .upload(fileName, logoFile.buffer, {
                        contentType: logoFile.mimetype,
                        cacheControl: '3600',
                        upsert: true,
                    });

                if (error) {
                    console.error('Error uploading new logo:', error.message);
                    res.status(500).json({ error: 'Failed to upload new logo.' }); // No return here
                    return; // Explicit return to stop execution
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
                // If formDataLogoUrl is an actual URL and no new file was uploaded, preserve it.
                updatePayload.logoUrl = formDataLogoUrl;
            } else {
                // If formDataLogoUrl is empty/undefined and no file, it means it's not being set/changed,
                // so default to existing unless explicitly set to null by frontend.
                updatePayload.logoUrl = oldLogoUrl;
            }


            // Handle Signature File Upload/Deletion
            if (signatureFile) {
                const fileName = `signature-${Date.now()}-${signatureFile.originalname.replace(/\s/g, '_')}`;
                const { data, error } = await supabase.storage
                    .from(BRANDING_ASSETS_BUCKET)
                    .upload(fileName, signatureFile.buffer, {
                        contentType: signatureFile.mimetype,
                        cacheControl: '3600',
                        upsert: true,
                    });

                if (error) {
                    console.error('Error uploading new signature:', error.message);
                    res.status(500).json({ error: 'Failed to upload new signature.' }); // No return here
                    return; // Explicit return to stop execution
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
                updatePayload.signatureUrl = oldSignatureUrl;
            }

            // Update the branding_settings table
            try {
                const { data, error } = await supabase
                    .from('branding_settings')
                    .update(updatePayload)
                    .eq('id', settingsId)
                    .select();

                if (error) {
                    console.error('Error updating branding settings in DB:', error.message);
                    throw new Error(error.message); // Throwing here will be caught by asyncHandler
                }
                if (!data || data.length === 0) {
                    res.status(404).json({ error: 'Branding settings record not found after attempt to update.' });
                    return;
                }
                res.status(200).json(data[0]);
                // No explicit return here for res.status.json()
            } catch (error: any) {
                console.error('Unexpected error during DB update for branding settings:', error.message);
                res.status(500).json({ error: 'Internal server error.', details: error.message });
            }
        })
    );

    return router;
};