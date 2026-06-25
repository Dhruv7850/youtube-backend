class ApiError extends Error{
    constructor(
        statusCodes,
        message = "Something went wrong",
        error = [],
        stack = ""
    ){
        super(message)
        this.statusCode = statusCodes
        this.data = null
        this.message = message
        this.error = error
        if(stack){
           this.stack = stack
        }else{
            Error.captureStackTrace(this, this.constructor)
        }
    }
}

export {ApiError};
