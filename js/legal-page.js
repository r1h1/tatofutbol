/* TatoTV · legal-page.js — pinta legal.html con el mismo documento que la puerta y el centro «Legal». */
document.getElementById("v").textContent = Legal.VERSION;
document.getElementById("doc").innerHTML = Legal.docHTML();
document.getElementById("third").innerHTML = Legal.thirdHTML();
