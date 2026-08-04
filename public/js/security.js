import { getUserSession } from "./session.js";


// Check if user is logged in

export function requireLogin(){

    const user = getUserSession();


    if(!user){

        window.location.href =
        "/pages/login.html";

        return null;

    }


    return user;

}



// Check permission

export function requirePermission(permission){


    const user = getUserSession();


    if(!user){

        window.location.href =
        "/pages/login.html";

        return null;

    }



    if(!user.permissions || 
       !user.permissions.includes(permission)){


        alert(
            "Access denied. You do not have permission to view this page."
        );


        window.location.href =
        "/pages/dashboard.html";


        return null;

    }


    return user;

}