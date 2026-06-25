import {v2 as cloudinary} from 'cloudinary';
import fs from 'fs';

const uploadOnCloudinary = async (localFilePath) => {
    try{
        if(!localFilePath)return null
        if(!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET){
            throw new Error("Cloudinary environment variables are missing")
        }
        cloudinary.config({
            cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
            api_key: process.env.CLOUDINARY_API_KEY,
            api_secret: process.env.CLOUDINARY_API_SECRET
        })
        //upload the file on cloudinary
        const response = await cloudinary.uploader.upload(localFilePath,{
            resource_type:"auto"
        })
        //file has been uploaded successfull
        console.log("file has been uploaded successfully", response.url);
        if(fs.existsSync(localFilePath)){
            fs.unlinkSync(localFilePath)
        }
        return response;
    }catch(error){
        if(localFilePath && fs.existsSync(localFilePath)){
            fs.unlinkSync(localFilePath) //remove the locally saved temporary file as the upload operation failed
        }
        throw error;
    }
}

export {uploadOnCloudinary};
