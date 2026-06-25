class ApiResponse{
    constructor(statusCodes, data, message = "Success"){
        this.statusCodes = statusCodes,
        this.data = data,
        this.message = message,
        this.success = this.success
    }
}

export { ApiResponse };