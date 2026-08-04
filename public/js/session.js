// Save logged-in user

export function saveUserSession(user) {

    localStorage.setItem(
        "kazmartUser",
        JSON.stringify(user)
    );

}


// Get logged-in user

export function getUserSession() {

    const user =
    localStorage.getItem("kazmartUser");


    if(user){

        return JSON.parse(user);

    }


    return null;

}


// Remove session (logout)

export function clearUserSession(){

    localStorage.removeItem("kazmartUser");

}