import {asyncHandler} from "../utils/asyncHandler.js";
import {ApiError} from "../utils/ApiError.js";
import {User} from "../models/user.model.js";
import {uploadOnCloudinary} from "../utils/cloudinary.js";
import {ApiResponse} from "../utils/ApiResponse.js";
import jwt from "jsonwebtoken"
import mongoose from "mongoose"


//Generate access token and refresh token for the user
const generateAccessAndRefreshToken = async(userId)=>{
    try{
        const user = await User.findById(userId);
        const accessToken = user.generateAccessToken();
        const refreshToken = user.generateRefreshToken();

        // Store the refresh token in the database
        user.refreshToken = refreshToken;
        await user.save({validateBeforeSave: false}) // validateBeforeSave: false is used to skip the validation of the user model before saving the refresh token in the database 

        return {accessToken, refreshToken};
    }
    catch(err){
        throw new ApiError(500, "Error while generating access and refresh token");
    }
}

const registerUser = asyncHandler(async(req, res, next)=>{
    const {username, fullname, password, email} = req.body;
    if([fullname, username, password, email].some((field)=>!field || field.trim()===""))
    {
        throw new ApiError(400,"All fields are required");
    }
    // Check if a user already exists with the same email or username
    const existingUser = await User.findOne({
        $or:[                     //OR operator to check either email or username
            {email},
            {username}]
    })
    if(existingUser)
    {
        throw new ApiError(409, "User already exists with the same email or username");
    }

    const avatarLocalPath = req.files?.avatar?.[0]?.path;
    const coverImageLocalPath = req.files?.coverImage?.[0]?.path;

    if(!avatarLocalPath)
    {
        throw new ApiError(400, "Avatar are required");
    }

    const avatar = await uploadOnCloudinary(avatarLocalPath)
    const coverImage = await uploadOnCloudinary(coverImageLocalPath)

    if(!avatar)
    {
        throw new ApiError(500, "Error while uploading avatar");
    }

    const user =  await User.create({
        fullname,
        avatar: avatar.url,
        coverImage: coverImage?.url || "",
        email,
        username: username.toLowerCase(),
        password
    });

    const createdUser = await User.findById(user._id).select("-password -refreshToken")

    if(!createdUser){
        throw new ApiError(500, "Something went wrong while creating user")
    }

    return res.status(201).json(
        new ApiResponse(200, createdUser, "User registered successfully")
    )
});

const loginUser = asyncHandler(async(req, res, next)=>{
    /*req.body should contain email and password
    1. validate the email and password
    2. check if user exists with the provided email
    3. if user exists then compare the provided password with the hashed password in the database
    4. if password is correct then generate access token and refresh token and send it to the client
    5. send cookies with the refresh token and access token in the response
    */
    const {email, password, username} = req.body;
    if(!email && !username){
        throw new ApiError(400, "Email and username are required");
    }

    const user = await User.findOne({
        $or:[
            {email},
            {username}
        ]
    })

    if(!user){
        throw new ApiError(404,'User does not exists')
    }

    const isPasswordValid = await user.isPasswordValid(password);

    if(!isPasswordValid){
        throw new ApiError(401, "Invalid Password");
    }

    const {accessToken, refreshToken} = await generateAccessAndRefreshToken(user._id);

    const loggedInUser = await User.findById(user._id).select("-password -refreshToken")

    const options = {
        httpOnly: true,
        secure: true
    }

    return res.status(200)
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, options)
    .json(
        new ApiResponse(200, {
            user: loggedInUser, accessToken, refreshToken
        }, 
            "User logged in successfully")
    )
})

const logoutUser = asyncHandler(async(req, res)=>{

    await User.findByIdAndUpdate(req.user._id, {
        $unset: {
            refreshToken: 1 // this removes the field refreshToken from the user document in the database, effectively logging the user out by invalidating the refresh token
        }
    }, {
        new: true
    })
    const options = {
        httpOnly: true,
        secure:true
    }
    return res.status(200)
    .clearCookie("accessToken", options)
    .clearCookie("refreshToken", options)
    .json(new ApiResponse(200, {}, "User logged out successfully"))
})

const AccessRefreshToken = asyncHandler(async(req, res)=>{
    const incomingRefreshToken = req.cookies.refreshToken || req.body.refreshToken

    if(!incomingRefreshToken){
        throw new ApiError(401,"unauthorized request")
    }

    try {
        const decodedToken = jwt.verify(incomingRefreshToken, process.env.REFRESH_TOKEN_SECRET);
    
        const user = await User.findById(deccodedToken?._id)
    
        if(!user){
            throw new ApiError(401, "Invalid refresh token");
        }
    
        if(incomingRefreshToken !== user?.refreshToken){
             throw new ApiError(401, "Refresh token is expired or used");
        }
    
        const options = {
            httpOnly: true,
            secure: true
        }
        const {accessToken, refreshToken} = await generateAccessAndRefreshToken(user._id)
    
        return res
                  .status(200)
                  .cookie("accessToken",accessToken, options)
                  .cookie("refreshToken", refreshToken, options)
                  .json(
                    new ApiResponse(
                        200,
                        {accessToken, refreshToken: newRefreshToken},
                        "Access token refreshed"
                    )
                  )
    } catch (error) {
        throw new ApiError(401, error?.message || "invalid refresh token")
    }
})

const changeCurrentPassword = asyncHandler(async(req, res)=>{
    const {oldPassword , newPassword} = req.body;

    const user = await User.findById(req.user?._id)
    user.isPasswordValid(oldPassword)

    if(!isPasswordCorrect){
        throw new ApiError(400, "Invalid old password")
    }

    user.password = newPassword
    await user.save({
        validateBeforeSave: false
    })

    return res
              .status(200)
              .json(new ApiResponse(200, {}, "Password changed successfully"))
    
})

const getCurrentUser = asyncHandler(async(req, res)=>{
    return res
              .status(200)
              .json(200, req.user, "Current user fetched successfully");
})

const updateAccountDetails = asyncHandler(async(req, res)=>{
    const{fullName, email} = req.body

    if(!fullName && !email){
        throw new ApiError(400, "All fields are required")
    }

    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set:{
                fullName: fullName,
                email: email
            }
        },
        {new : true}
    ).select("-password")
    return res
    .status(200)
    .json(new ApiError(200, user, "Account details update successfully"))
})

const updateUserAvatar = asyncHandler(async(req, res)=>{
    const avatarLocalPath = req.file?.path

    if(!avatarLocalPath){
        throw new ApiError(400, "Avatar file is missing");
    }

    const avatar = await uploadOnCloudinary(avatarLocalPath);

    if(!avatar.url){
        throw new ApiError(400, "Error while updating the avatar");
    }

    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set:{
                avatar: avatar.url
            }
        },
        {new: true}
    ).select("-password")

    return res
    .status(200)
    .json(new ApiResponse(200, user, "Avatar updated successfully"))

})

const updateUserCoverImage = asyncHandler(async(req, res)=>{
    const coverImageLocalPath = req.file?.path

    if(!coverImageLocalPath){
        throw new ApiError(400, "Cover image file is missing");
    }

    const coverImage = await uploadOnCloudinary(coverImageLocalPath);

    if(!coverImage.url){
        throw new ApiError(400, "Error while updating the cover image");
    }

    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set:{
                coverImage: coverImage.url
            }
        },
        {new: true}
    ).select("-password")

    return res
    .status(200)
    .json(new ApiResponse(200, user, "Cover image updated successfully"))

})

const getUserChannelProfile = asyncHandler(async(req, res)=>{

    const {username} = req.params;

    if(!username?.trim()){
        throw new ApiError(400, "Username is required");
    }

    const channel = await User.aggregate([
        {
            $match:{
                username: username?.toLowerCase()
            }
        },
        {
            $lookup:{
                from:"subscription",
                localField: "_id",
                foreignField:"channel",
                as:"subscribers"
            }
        },
        {
            $lookup:{
                from:"subscriptions",
                localField: "_id",
                foreignField:"subscriber",
                as:"subscribedTo"
            }
        },
        {
            $addFields:{
                subscribersCount:{
                    $size:"$subscribers"
                },
                channelsSubscribedToCount:{
                    $size:"$subscribedTo"
                },
                isSubscribed:{
                    $cond:{
                        if: {$in: [req.user?._id, "$subscribers.subscriber"]},
                        then:true,
                        else: false
                    }
                }
            }
        },
        {
            $project :{
                fullName: 1,
                username: 1,
                subscribersCount: 1,
                channelsSubscribedToCount:1,
                isSubscribed:1,
                avatar:1,
                coverImage: 1,
                email: 1
            }
        }
    ])
   
    if(!channel?.length){
        throw new ApiError(404, "Channel does not exist");
    }

    return res.status(200)
    .json(new ApiResponse(200, channel[0], "Channel profile fetched successfully"))
})

const getWatchHistory = asyncHandler(async(req, res)=>{
    const user = await User.aggregate([
        {
            $match:{
                _id: new mongoose.Types.ObjectId(req.user?._id)
            }
        },
        {
            $lookup:{
                from: "Video",
                localField: "watchHistory",
                foreignField: "_id",
                as: "watchedVideos",
                pipeline:[
                    {
                        $lookup:{
                            from:"user",
                            localField:"owner",
                            foreignField:"_id",
                            as:"owner",
                            pipeline:[
                                {
                                    $project:{
                                        fullName:1,
                                        usename:1,
                                        avatar:1

                                    }
                                }
                            ]
                        }
                    },
                    {
                        $addFields:{
                            owner:{
                                $first:"$owner"
                            }
                        }
                    }
                ]
            }
        }
    ])
    return res.status(200)
    .json(new ApiResponse(200, user[0]?.watchedVideos || [], "Watch history fetched successfully"))
})

export { 
    registerUser, 
    loginUser,
    logoutUser, 
    AccessRefreshToken,
    changeCurrentPassword,
    getCurrentUser,
    updateAccountDetails,
    updateUserAvatar,
    updateUserCoverImage,
    getUserChannelProfile,
    getWatchHistory
};